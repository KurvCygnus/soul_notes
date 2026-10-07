//* 预警 WebSocket 通道 (/ws/alert): 强预警弹窗的在线推送路径, 断线自动重连. P3 起双事件复用一条连接:
//* RED_ALERT → onRed (预警弹窗); ext-notification → onExtNotification (前台横幅/后台壳桥, 分流见 utils/extNotification).
//! 路径为 `/ws` 而非 `/api`: Vite/网关按 `/ws` 前缀单独转发 (ws: true), 与 REST 代理规则不同.
import { API_BASE } from './http'

//* 预警负载: type/message/hotline/appointmentUrl 为后端透传字段;
//* reason 是前端归一化字段 — 派发时由后端 message 别名而得 (reason ?? message), 消费方只读 reason 即可拿到预警文案.
export interface IRedAlertMessage
{
    type: string
    reason?: string
    message?: string
    hotline?: string
    appointmentUrl?: string
}

//* 扩展通知负载 (P3): 调度器经 WS 下发的 opt-in 提醒帧 (type 恒 "ext-notification"), 三字段为后端契约保证非空.
export interface IExtNotificationMessage
{
    type: string
    title: string
    body: string
    tag: string
}

//* ext-notification 的结构化判据 (chat.ts#routeEvent 同款思路): 形状残缺 (缺任一契约字段) 不算契约事件 —
//! 静默丢弃, 绝不降级进 RED 弹窗 (安全 UI 不可被坏帧误触), 也不把半截 JSON 灌进横幅.
function isExtNotification(v: unknown): v is IExtNotificationMessage
{
    if(typeof v !== 'object' || v == null)
        return false
    const rec = v as Record<string, unknown>
    return rec.type === 'ext-notification'
        && typeof rec.title === 'string'
        && typeof rec.body === 'string'
        && typeof rec.tag === 'string'
}

//* 预警 WS 端点 URL: 缺省随页面 origin; 壳内 (API_BASE 在场) 从 API_BASE 推导协议与主机 —
//* assets 域名下 window.location.host 指向壳内资源域, WS 必须直连后端 (spec §5).
export function alertSocketUrl(apiBase: string): string
{
    if(apiBase === '')
    {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        return `${proto}://${window.location.host}/ws/alert`
    }
    const base = new URL(apiBase)
    const proto = base.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${base.host}/ws/alert`
}

const INITIAL_BACKOFF_MS = 3000
const MAX_BACKOFF_MS = 30000

/**
 * 建立预警连接并返回关闭函数.
 * 指数退避重连: 失败后按 3s→6s→12s→24s→30s (封顶) 节流重试, 成功 open 后归零 —
 * 服务端短暂不可用不至于雪崩式打满网关, 而长时间故障也不应把惩罚继承到恢复后.
 * 关闭函数幂等: 同时撤销 socket 与未触发的重连定时器, 重复调用无副作用.
 * onExtNotification 可选: 合法通知帧在回调缺席时同样被消费掉 (不外溢不抛错), 旧调用方零感知.
 */
export function connectAlertSocket(
    token: string,
    onRed: (msg: IRedAlertMessage) => void,
    onExtNotification?: (msg: IExtNotificationMessage) => void,
): () => void
{
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoffMs = INITIAL_BACKOFF_MS
    let closed = false

    const scheduleReconnect = () =>
    {
        if(closed)
            return
        reconnectTimer = setTimeout(connect, backoffMs)
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    }

    const connect = () =>
    {
        socket = new WebSocket(`${alertSocketUrl(API_BASE)}?token=${encodeURIComponent(token)}`)
        socket.onopen = () => { backoffMs = INITIAL_BACKOFF_MS }
        socket.onmessage = ev =>
        {
            let parsed: unknown
            try { parsed = JSON.parse(ev.data) }
            catch
            {
                //* 非 JSON 帧 (keep-alive 等) 直接忽略: 传输层不应对业务路由抛错.
                return
            }
            if(typeof parsed === 'object' && parsed != null && (parsed as Record<string, unknown>).type === 'RED_ALERT')
            {
                const alert = parsed as IRedAlertMessage
                //* reason 归一化: 后端负载只发 message (AlertWebSocket), 而前端契约 (预警弹窗) 读 reason,
                //* 不在此别名则下游静默渲染空文案; 其余字段原样透传, reason 已存在时不覆盖.
                onRed({ ...alert, reason: alert.reason ?? alert.message })
                return
            }
            if(isExtNotification(parsed))
                onExtNotification?.(parsed)
        }
        //* onerror 后浏览器必触发 onclose, 统一由 onclose 调度重连, 避免双路径重复计时.
        socket.onerror = () => { socket?.close() }
        socket.onclose = scheduleReconnect
    }

    connect()

    return () =>
    {
        if(closed)
            return
        closed = true
        if(reconnectTimer != null)
            clearTimeout(reconnectTimer)
        socket?.close()
    }
}
