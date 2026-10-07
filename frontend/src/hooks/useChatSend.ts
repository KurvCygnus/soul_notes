//* 聊天发送管线 (ChatView 的状态收敛点): SSE 流式主路径 + 非流式降级 + 会话绑定 + 竞态守卫 (Task 11).
//* homepage-v2 Task 9 (D16 记一笔移除): 日记域入口退场, handleSend 收敛为单一聊天模式 —
//* RED 预警不再有日记兜底出口, 在线链走 WS 通道, 离线安全网由后端热线/危机域承接 (前端不触碰红线链).
//* 核心机制 (收敛在 genRef 单一单调通道上):
//*   1. 会话绑定: sessionIdRef 是唯一事实, meta 事件与历史打开都写它; 渲染不读 ref (React 契约).
//*   2. 竞态守卫: openSession/startNewChat/doSend 各自 ++genRef 并捕获快照, 一切异步回调 (onChunk/
//*      历史应用/降级/错误提示) 应用前先比对 gen — 快速连点只认最后一次, 流中切换使旧流全部失效.
//*   3. 会话切换策略 = 切换即中止 (abort-on-switch): 打开会话/新对话先 abort 在途流, 部分内容随旧会话
//*      一起丢弃; 不锁侧栏 (锁定策略需把流式状态提升进壳层, 代价大于收益), 取舍记录于 task-10 报告.
//*   4. 卸载中止: cleanup abort 在途 fetch 释放连接, aliveRef 拦截迟到回调 (StrictMode 重挂安全).
import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages, sendMessage, streamMessage } from '../api/chat'
import { ApiError } from '../api/http'
import { createContractBlockFilter } from '../utils/contractBlockFilter'
import { useAuth } from './useAuth'
import { useChatGate } from './useChatGate'
import type { ISessionOpenRequest } from '../views/chatContext'
import type { IDisplayMessage } from '../utils/group'
import type { ChatMessage, ChatSessionVo } from '../types'

export interface IUseChatSendParams
{
    sessions: ChatSessionVo[] | null
    openRequest: ISessionOpenRequest | null
    reloadSessions(): void
}

export interface IChatSendState
{
    messages: IDisplayMessage[]
    streaming: boolean
    streamError: string | null
    startNewChat(): void
    //* Task 11 Composer 的接线点: 访客经门拦截 (requireAuth 已登录时同步放行), 登录后补发.
    handleSend(content: string): void
    //* 当前打开 (绑定) 的会话 ID; null = 无 (hero/新对话). 渲染态: 视图层据此从 sessions 列表取材
    //* (会话标题主区左上展示), 事实源仍是 sessions 列表 (reload 后标题随之刷新).
    activeSessionId: string | null
    //* 每会话输入草稿 (R3+): 当前键 (activeSessionId 同源, null = 新会话/首页) 的未发送输入镜像,
    //* 经 ChatView 下发 Composer 回灌; setDraft 是 Composer onDraftChange 的接线点 (回写 + 换镜像).
    draft: string
    setDraft(content: string): void
    //* 候选追问 (Task 8): 当前会话最新一条 AI 回复的追问产物 — 数据源为流式 followups 尾随事件与
    //* 历史回放的 VO followups, 新一轮发送前清空旧候选 (渲染挂载点归 ChatStream, 仅末条 AI 回复下展示).
    followups: string[]
    //* 工具调用过程文案 (工具调用可见性): 流式 tool-call 事件携带的扩展自定义 label (如 "正在查询课表…"),
    //* 展示在流式等待的思考指示中; null = 本轮未发生工具调用, 视图回落 "思考中". 新一轮发送/切会话即清.
    toolLabel: string | null
}

//* 流式增量: 追加到末尾消息. 单发送不变量: 流式期间末尾必为本条的 assistant 气泡 (历史加载由 gen 守卫互斥).
function appendToken(prev: IDisplayMessage[], token: string): IDisplayMessage[]
{
    const last = prev[prev.length - 1]
    if(last == null)
        return prev
    return [...prev.slice(0, -1), { ...last, content: last.content + token }]
}

//* 降级回复: 以服务端 ts 戳版本替换末尾空 assistant 气泡; 末尾形态不符即不动 (防御式, 不误伤).
function applyReply(prev: IDisplayMessage[], reply: ChatMessage): IDisplayMessage[]
{
    const last = prev[prev.length - 1]
    if(last == null || last.role !== 'assistant' || last.content !== '')
        return prev
    return [...prev.slice(0, -1), { role: 'assistant', content: reply.content, ts: reply.timestamp ?? null }]
}

//* 彻底失败: 移除末尾空 assistant 气泡 (保留用户消息与错误提示), 不留空泡.
function dropTrailingEmpty(prev: IDisplayMessage[]): IDisplayMessage[]
{
    const last = prev[prev.length - 1]
    if(last == null || last.role !== 'assistant' || last.content !== '')
        return prev
    return prev.slice(0, -1)
}

//* 与 [[api]]/[[streamMessage]] 的取消约定逐字对齐: 按 name 判定而非 instanceof DOMException (跨 realm 不可靠).
function isAbort(e: unknown): boolean
{
    return e instanceof Error && e.name === 'AbortError'
}

//* 标题补拉延迟: 会话标题由后端在首轮交换后 fire-and-forget 异步生成 (LLM 调用, 数秒级落库),
//* 流结束那一刻的立即刷新拿到的还是无标题态 (侧栏与主区标题会长时间停留在 fallback 预览, 走查实测).
const TITLE_REFRESH_DELAY_MS = 5000

export function useChatSend({ sessions, openRequest, reloadSessions }: IUseChatSendParams): IChatSendState
{
    //* 登录态判定收在门内 ([[IChatGate.requireAuth]] 读 userRef); 这里直读 user 仅为登出复位 (隐私红线):
    //* 登出瞬间未读会话内容必须立即离开屏幕, 不能等下一次交互.
    const { user } = useAuth()
    const gate = useChatGate()

    const [messages, setMessages] = useState<IDisplayMessage[]>([])
    const [streaming, setStreaming] = useState(false)
    const [streamError, setStreamError] = useState<string | null>(null)
    //* 绑定会话的渲染态镜像: sessionIdRef 仍是唯一事实 (竞态守卫读 ref), 本 state 只供视图取材.
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    //* 候选追问 (Task 8): 与 messages 同生命周期 — 流式尾随事件落定, 历史回放按 VO 重建, 发送/切会话即清.
    const [followups, setFollowups] = useState<string[]>([])
    //* 工具调用过程文案 (工具调用可见性): 与 followups 同生命周期 — 流中 tool-call 事件写入,
    //* 新一轮发送/切会话/新对话即清; 分片到达后思考指示随条件退场, label 值无需主动清零.
    const [toolLabel, setToolLabel] = useState<string | null>(null)

    //* 每会话输入草稿台账 (R3+): 键 = 绑定会话 ID (null = 新会话/首页), 各会话草稿互不串扰, 回到原会话恢复.
    //* 裁定: Map 挂 ref (每次击键回写零重渲染), 当前键的值另以 draft 渲染态镜像下发 — 切换会话时镜像随键
    //* 换发, Composer 据此回灌. 刻意不落 localStorage 且不跨 ChatView 卸载存活 (扩展节往返即弃):
    //* 定位是会话内轻量暂存, 刷新/换页丢失可接受, 避免再引入一层存储同步与清理簿记.
    const draftsRef = useRef<Map<string | null, string>>(new Map())
    const [draft, setDraft] = useState('')

    const sessionIdRef = useRef<string | null>(null)
    const genRef = useRef(0)
    const abortRef = useRef<AbortController | null>(null)
    const aliveRef = useRef(true)

    useEffect(() =>
    {
        aliveRef.current = true  //* StrictMode 双调用 setup: 重挂前复位, 守卫不能被上一次 cleanup 污染.
        return () =>
        {
            aliveRef.current = false
            abortRef.current?.abort()  //* 卸载中止在途流: 释放连接, 迟到回调被 aliveRef 拦截.
        }
    }, [])

    const loadMessages = useCallback((id: string, gen: number): void =>
    {
        listMessages(id).
            then(list =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return
                setMessages(list.map(m => ({ role: m.role, content: m.content, ts: m.ts ?? null })))
                //* 候选行随历史重建 (Task 8): 仅末条 assistant 携带的 followups 有效 —
                //* 后端把追问附加在最近一条 AI 消息上, 用户末条/空历史一律无候选.
                const last = list[list.length - 1]
                setFollowups(last != null && last.role === 'assistant' ? (last.followups ?? []) : [])
            }).
            catch((e: unknown) =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return
                setStreamError(e instanceof ApiError ? e.message : '会话加载失败, 请稍后再试.')
            })
    }, [])

    const openSession = useCallback((id: string) =>
    {
        if(sessionIdRef.current === id)
            return  //* 已在该会话: 幂等短路 (重复点击不重复拉取, 也避免流中自中止).
        abortRef.current?.abort()  //* 切换即中止 (机制 3): 在途流随旧会话一起丢弃.
        const gen = ++genRef.current
        sessionIdRef.current = id
        setActiveSessionId(id)
        setDraft(draftsRef.current.get(id) ?? '')  //* 草稿随键换发: 目标会话没写过即空 (R3+).
        setStreaming(false)
        setStreamError(null)
        setFollowups([])  //* 旧会话候选不跨会话存活 (历史补拉按 VO 重建, Task 8).
        setToolLabel(null)  //* 旧会话工具过程文案不跨会话存活 (工具调用可见性).
        loadMessages(id, gen)
    }, [loadMessages])

    const startNewChat = useCallback(() =>
    {
        abortRef.current?.abort()
        ++genRef.current
        sessionIdRef.current = null
        setActiveSessionId(null)
        //* 草稿随键换发: 新会话/首页是独立草稿槽 (null 键), 与各会话草稿互不影响 (R3+ 裁定:
        //* null 键恢复的是"首页草稿" — 用户在新会话页写过未发送, 绕去别的会话再回来不丢).
        setDraft(draftsRef.current.get(null) ?? '')
        setStreaming(false)
        setStreamError(null)
        setMessages([])
        setFollowups([])  //* 新对话无候选 (Task 8).
        setToolLabel(null)
    }, [])

    //* Composer onDraftChange 接线点: 回写台账 + 同步镜像, 键以 sessionIdRef 为准 (唯一事实,
    //* 与 openSession/startNewChat 的恢复键同源, 写读必然对上).
    const setDraftForActive = useCallback((content: string) =>
    {
        draftsRef.current.set(sessionIdRef.current, content)
        setDraft(content)
    }, [])

    //* 侧栏打开请求通道: nonce 变化即尝试打开, openSession 内部幂等.
    useEffect(() =>
    {
        if(openRequest != null)
            openSession(openRequest.sessionId)
    }, [openRequest, openSession])

    //* 打开中的会话被删除 (壳层 sessions 列表比对): 自动复位 hero. 失败重拉保留旧列表, 不会误清.
    useEffect(() =>
    {
        const openId = sessionIdRef.current
        if(openId == null || sessions == null)
            return
        if(!sessions.some(s => s.sessionId === openId))
            startNewChat()
    }, [sessions, startNewChat])

    //* 登出复位 (隐私): user -> null 即无条件清屏 ([[startNewChat]] = abort 在途流 + ++gen 使一切迟到回调
    //* 失效 + 清 messages/streaming/streamError/sessionIdRef). 不能以 sessionIdRef 是否已绑定作前置:
    //* meta 未达 (未绑定窗口) 与新会话降级全程 sessionIdRef 均为 null, 条件化会让乐观气泡与迟到的
    //* 降级回复留在已登出的屏幕上. 幂等: 空屏重复执行无副作用; 再登录分支不在此处理.
    //* 草稿台账一并清空 (R3+): 未发送草稿可能是前账号写下的私语, 与清屏同口径不得跨账号存活.
    useEffect(() =>
    {
        if(user == null)
        {
            draftsRef.current.clear()  //* 台账先清: startNewChat 的 null 键恢复随之必得空串, 一次复位两处落定.
            // oxlint-disable-next-line react/set-state-in-effect //! 登出清屏是对认证状态迁移的响应式复位, 属 effect 的合法外部系统同步; 渲染期调整或 key 重挂会扩大改动面, 规则的级联担忧在此不成立 (登出是低频单次迁移).
            startNewChat()
        }
    }, [user, startNewChat])

    //* 发送成功收尾: 补拉历史换 ts 戳版本 (乐观消息无 ts), 并刷新侧栏会话列表;
    //* 再延迟补一次刷新 — 把异步落库的会话标题带进侧栏/主区 (fallback 预览只应存在秒级窗口).
    const finalizeSend = useCallback((gen: number): void =>
    {
        const bound = sessionIdRef.current
        if(bound != null)
            loadMessages(bound, gen)
        reloadSessions()
        setTimeout(reloadSessions, TITLE_REFRESH_DELAY_MS)  //* 刻意不做 gen 守卫: 会话列表是壳层全局态, 切换后补拉依然正确.
    }, [loadMessages, reloadSessions])

    const doSend = useCallback((content: string) =>
    {
        abortRef.current?.abort()  //* 上一条流若仍在途: 先中止 (Composer Task 11 将禁并发, 这里兜底).
        const gen = ++genRef.current
        const controller = new AbortController()
        abortRef.current = controller

        setMessages(prev => [...prev, { role: 'user', content, ts: null }, { role: 'assistant', content: '', ts: null }])
        setStreamError(null)
        setStreaming(true)
        setFollowups([])  //* 新一轮发送前清空旧候选 (Task 8): 末条变为本轮新回复, 旧追问已失效.
        setToolLabel(null)  //* 同步清空上一轮的工具过程文案 (工具调用可见性).

        //* 契约块守卫 (展示层, [[createContractBlockFilter]]): 后端流式 emit 保持原文 (拆流只在落库),
        //* <!--soulnotes {...}--> 结构化块随分片原样到达 — 守卫跨片扣留/吸收, 逐字渲染的同时保证
        //* 结构化载荷不外显 (流式分片与 md 渲染器都按纯文本呈现 raw HTML, 后端"注释隐形"兜底在本端不成立).
        const blockFilter = createContractBlockFilter()

        let received = false  //* 同步闩锁: 流式是否已到过"可见"内容, 决定失败走降级还是保留部分
        //* (被守卫整片吸收的契约块分片不算 — 用户视角仍是零内容, 零内容失败应走非流式重试).
        streamMessage({
            sessionId: sessionIdRef.current,
            content,
            signal: controller.signal,
            onMeta: id =>
            {
                sessionIdRef.current = id  //* meta 绑定: 后端实际使用的会话 ID, 后续发送续接.
                setActiveSessionId(id)
            },
            onChunk: token =>
            {
                const visible = blockFilter.push(token)
                if(visible === '')
                    return  //* 整片被守卫吸收 (契约块内容): 无可见增量, 也不置 received.
                received = true
                if(!aliveRef.current || genRef.current !== gen)
                    return  //* 切换/卸载后的迟到 token: 丢弃, 不污染新视图.
                setMessages(prev => appendToken(prev, visible))
            },
            onFollowups: items =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return  //* 切换/卸载后的迟到追问: 丢弃, 不污染新视图 (与 token 同一守卫口径).
                setFollowups(items)
            },
            onToolCall: label =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return  //* 切换/卸载后的迟到工具事件: 丢弃, 不污染新视图 (与 token 同一守卫口径).
                setToolLabel(label)
            },
        }).
            then(() =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return
                const tail = blockFilter.flush()  //* 流尾交还未决扣留 (正文以 "<!--" 收尾是合法内容);
                if(tail !== '')                   //* 未闭合契约块在 flush 内整块舍弃, 历史以服务端拆流为权威.
                    setMessages(prev => appendToken(prev, tail))
                setStreaming(false)
                finalizeSend(gen)
            }).
            catch((e: unknown) =>
            {
                if(!aliveRef.current || genRef.current !== gen || isAbort(e))
                    return  //* 切换/卸载/主动中止: 新视图已接管, 一切静默.
                if(received)
                {
                    setStreaming(false)
                    setStreamError('回复中断了, 已保留部分内容, 你可以稍后再试.')
                    return
                }
                //* 降级: 流式零内容失败 → 非流式同会话重试一次 (离线安全网语义: 网络不可达时两个路径同失败).
                sendMessage(sessionIdRef.current, content).
                    then(reply =>
                    {
                        if(!aliveRef.current || genRef.current !== gen)
                            return
                        if(sessionIdRef.current == null && reply.sessionId != null)
                        {
                            //* 降级路径的 meta 对齐 (fast-follow 补齐): 新建会话的降级回复携带实际会话 ID,
                            //* 不绑定则后续发送每条都新建会话 (走查实测同款缺陷在流式路径已由 meta 消除).
                            sessionIdRef.current = reply.sessionId
                            setActiveSessionId(reply.sessionId)
                        }
                        setStreaming(false)
                        setMessages(prev => applyReply(prev, reply))
                        finalizeSend(gen)
                    }).
                    catch(() =>
                    {
                        if(!aliveRef.current || genRef.current !== gen)
                            return
                        setStreaming(false)
                        setMessages(prev => dropTrailingEmpty(prev))
                        setStreamError('消息暂时没有送达, 请稍后再试.')
                    })
            }).
            finally(() =>
            {
                if(abortRef.current === controller)
                    abortRef.current = null  //* 身份比对: 防止误清后继发送的 controller.
            })
    }, [finalizeSend])

    //* 发送入口 (Task 11 Composer 接线): 访客点发送 → 门拦截开浮层, confirm 落登录态后补发; 已登录直接放行.
    const handleSend = useCallback((content: string) =>
    {
        gate.requireAuth(() => doSend(content))
    }, [doSend, gate])

    return { messages, streaming, streamError, startNewChat, handleSend, activeSessionId, draft, setDraft: setDraftForActive, followups, toolLabel }
}
