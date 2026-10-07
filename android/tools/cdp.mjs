#!/usr/bin/env node
//* CDP 冒烟驱动 (零依赖, Node 22+ 内建 fetch/WebSocket): 经 adb forward 连 WebView devtools socket,
//* 以选择器定位元素并运行时计算坐标 — 根治"截图估坐标"误差源; 触控经 CDP 直入页面, 完全绕开物理像素换算.
//? 为什么是 CDP 而非 uiautomator: WebView 的 DOM 对 Android UIA 是不透明黑盒 (Appium 对 WebView 同样切
//? CDP/Chromedriver), 前端加 "UIA ID" 无法让 uiautomator 看见; debug 构建已按 FLAG_DEBUGGABLE 门禁开启
//? setWebContentsDebuggingEnabled, 本工具即其消费端. release 构建无此 socket, 属预期.
//* 用法: node cdp.mjs <命令> [参数]
//*   targets                 列出可调试页面目标
//*   tap "<selector>"        定位元素中心并分发触控 (touchStart/End)
//*   text "<selector>"       输出元素 innerText (JSON)
//*   attr "<selector>" "<name>"  输出元素属性值
//*   type "<text>"           向当前聚焦元素插入文本 (绕开 IME)
//*   press <Enter|Tab|...>   分发按键 (keyDown+keyUp)
//*   eval "<js>"             执行任意页面 JS, 输出 JSON 结果
//*   shot <file.png>         Page.captureScreenshot 存盘
//*   wait "<js-expr>" [ms]   轮询求值直至为真 (默认 8000ms), 冒烟脚本用它与 SSE/弹窗时序解耦
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const ADB = 'adb'
//* 经 env CDP_PORT 可覆盖 — 9222 常被宿主 msedgewebview2 (Tauri 应用族) 监听, 冲突时换高位端口.
const FORWARD_PORT = Number(process.env.CDP_PORT) || 19222

//region 发现: 找 WebView devtools socket → adb forward → /json/list 选 appassets 页面
function discoverSocket()
{
    //* 主路径: pidof 构造标准 socket 名 — 新版 Android 对 /proc/net/unix 有 hidepid 限制, shell 扫描常不可见.
    const pkg = 'dev.kurvcygnus.soulnotes'
    const pid = execSync(`adb shell pidof ${pkg}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split(/\s+/)[0]
    if(pid)
        return `webview_devtools_remote_${pid}`
    //* 回退: 扫描 (老设备无 hidepid 时可用).
    const out = execSync('adb shell cat /proc/net/unix', { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    const m = out.match(/webview_devtools_remote_\d+/g) ?? []
    if(m.length === 0)
        throw new Error(`未发现 devtools socket — 应用未运行 (pidof 空) 或非 debug 构建 (release 无 CDP, 属预期)`)
    return m[0]
}

function forward(socketName)
{
    try { execSync(`adb forward --remove tcp:${FORWARD_PORT}`, { stdio: 'ignore' }) } catch { /* 无既有映射属预期 */ }
    try { execSync(`adb forward tcp:${FORWARD_PORT} localabstract:${socketName}`, { stdio: 'ignore' }) }
    catch
    {
        //! 端口被既有 forward 占据 (设备断连重连后旧映射常残留且仍可用): 端点活着就复用, 不再硬失败.
        try { execSync(`adb forward --remove tcp:${FORWARD_PORT}`, { stdio: 'ignore' }) } catch { /* 再试一次清理 */ }
        try { execSync(`adb forward tcp:${FORWARD_PORT} localabstract:${socketName}`, { stdio: 'ignore' }) }
        catch { /* 双败后由 pickTarget 的 fetch 兜底探测: 9222 已有可用转发则放行 */ }
    }
}

async function pickTarget()
{
    const list = await (await fetch(`http://127.0.0.1:${FORWARD_PORT}/json/list`)).json()
    const pages = list.filter(t => t.type === 'page' && t.url.includes('appassets.androidplatform.net'))
    if(pages.length === 0)
        throw new Error('未找到 appassets 页面目标: ' + JSON.stringify(list.map(t => `${t.type}:${t.url}`)))
    return pages[pages.length - 1]  //* 多页时取最新 (SPA 通常单页; 弹出新窗取栈顶).
}
//endregion

//region CDP 会话: 单命令一次性连接 (无状态, 便于 bash 串接), 每命令独立超时
async function withSession(fn)
{
    const target = await (async () =>
    {
        forward(discoverSocket())
        return pickTarget()
    })()
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('WebSocket 连接失败')) })
    let seq = 0
    const pending = new Map()
    ws.onmessage = ev => {
        const msg = JSON.parse(ev.data)
        if(msg.id && pending.has(msg.id))
            pending.get(msg.id)(msg)
    }
    const send = (method, params = {}, timeoutMs = 10000) => new Promise((ok, fail) => {
        const id = ++seq
        const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP 超时: ${method}`)) }, timeoutMs)
        pending.set(id, msg => { clearTimeout(timer); pending.delete(id)
            msg.error ? fail(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : ok(msg.result) })
        ws.send(JSON.stringify({ id, method, params }))
    })
    try
    {
        return await fn(send)
    }
    finally
    {
        ws.close()
    }
}

const evalJs = (send, expr, timeoutMs = 10000) => send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true }, timeoutMs).then(r => {
        if(r.exceptionDetails)
            throw new Error('页面求值异常: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails))
        return r.result.value
    })
//endregion

//region 命令实现
const SEL_GUARD = sel => { if(sel.includes('"')) throw new Error('选择器含双引号, 换用单引号形式'); }

const centerOf = sel => `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(sel)});
    if(!e) return null; const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })())`

const commands = {
    targets: async send => {
        forward(discoverSocket())
        const list = await (await fetch(`http://127.0.0.1:${FORWARD_PORT}/json/list`)).json()
        console.log(JSON.stringify(list.map(t => ({ type: t.type, url: t.url, title: t.title })), null, 2))
    },
    tap: async (send, sel) => {
        SEL_GUARD(sel)
        const pt = JSON.parse(await evalJs(send, centerOf(sel)))
        if(!pt) throw new Error(`元素不存在: ${sel}`)
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        console.log(JSON.stringify({ tapped: sel, at: pt }))
    },
    tapn: async (send, sel, n) => {
        SEL_GUARD(sel)
        const pt = JSON.parse(await evalJs(send,
            `JSON.stringify((() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${Number(n) || 0}];
            if(!e) return null; const r = e.getBoundingClientRect();
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })())`))
        if(!pt) throw new Error(`第 ${n} 个元素不存在: ${sel}`)
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        console.log(JSON.stringify({ tapped: `${sel}[${n}]`, at: pt }))
    },
    tapxy: async (send, x, y) => {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Number(x), y: Number(y) }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        console.log(JSON.stringify({ tapped: `xy(${x},${y})` }))
    },
    text: async (send, sel) => SEL_GUARD(sel) ?? console.log(JSON.stringify(await evalJs(send,
        `document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`))),
    attr: async (send, sel, name) => SEL_GUARD(sel) ?? console.log(JSON.stringify(await evalJs(send,
        `document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)}) ?? null`))),
    type: async (send, text) => {
        await send('Input.insertText', { text })
        console.log(JSON.stringify({ typed: text }))
    },
    press: async (send, key) => {
        const defs = { Enter: { keyCode: 13, text: '\r' }, Tab: { keyCode: 9 }, Escape: { keyCode: 27 },
            Backspace: { keyCode: 8 }, ArrowDown: { keyCode: 40 }, ArrowUp: { keyCode: 38 } }
        const d = defs[key]
        if(!d) throw new Error('不支持的键: ' + key + ' (可用: ' + Object.keys(defs) + ')')
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: d.keyCode, text: d.text })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: d.keyCode })
        console.log(JSON.stringify({ pressed: key }))
    },
    eval: async (send, expr) => console.log(JSON.stringify(await evalJs(send, expr))),
    shot: async (send, file) => {
        const r = await send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(file, Buffer.from(r.data, 'base64'))
        console.log(JSON.stringify({ saved: file }))
    },
    wait: async (send, expr, ms = 8000) => {
        const deadline = Date.now() + ms
        for(;;)
        {
            const v = await evalJs(send, `JSON.stringify(!!(${expr}))`)
            if(JSON.parse(v)) { console.log(JSON.stringify({ waitOk: expr })); return }
            if(Date.now() > deadline) throw new Error(`wait 超时 (${ms}ms): ${expr}`)
            await new Promise(ok => setTimeout(ok, 300))
        }
    },
}
//endregion

//region 入口
const [cmd, ...args] = process.argv.slice(2)
if(!cmd || !commands[cmd])
{
    console.error('用法: node cdp.mjs <' + Object.keys(commands).join('|') + '> [参数...]')
    process.exit(cmd ? 2 : 0)
}
withSession(send => commands[cmd](send, ...args)).catch(e => { console.error('[cdp] ' + e.message); process.exit(1) })
//endregion
