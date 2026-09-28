//* RED 预警 WebSocket 通道 (/ws/alert): 强预警弹窗的在线推送路径, 断线自动重连.
//! 路径为 `/ws` 而非 `/api`: Vite/网关按 `/ws` 前缀单独转发 (ws: true), 与 REST 代理规则不同.

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

const INITIAL_BACKOFF_MS = 3000
const MAX_BACKOFF_MS = 30000

/**
 * 建立预警连接并返回关闭函数.
 * 指数退避重连: 失败后按 3s→6s→12s→24s→30s (封顶) 节流重试, 成功 open 后归零 —
 * 服务端短暂不可用不至于雪崩式打满网关, 而长时间故障也不应把惩罚继承到恢复后.
 * 关闭函数幂等: 同时撤销 socket 与未触发的重连定时器, 重复调用无副作用.
 */
export function connectAlertSocket(token: string, onRed: (msg: IRedAlertMessage) => void): () => void
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
        //* 协议随页面: https 页面下必须用 wss, 否则被浏览器混合内容策略拦截; 开发期由 Vite 将 /ws 代理到后端.
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        socket = new WebSocket(`${proto}://${window.location.host}/ws/alert?token=${encodeURIComponent(token)}`)
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
            }
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
