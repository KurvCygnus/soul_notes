//* 对话域 API: SSE 流式主路径 + 非流式降级与会话管理.
//! 路径均为全量 `/api/v1/...`: [[api]] 不做前缀拼接, 依赖 Vite/网关按 `/api` 前缀转发, 半路径会绕过代理.
import { ApiError, api, getToken } from './http'
import { createSseParser } from '../utils/sse'
import type { ChatHistoryMessage, ChatMessageVo, ChatSessionVo } from '../types'

//region 流式主路径

export interface IStreamOptions
{
    sessionId: string | null
    content: string
    signal?: AbortSignal
    onMeta: (sessionId: string) => void
    onChunk: (token: string) => void
}

/**
 * 流式对话 (POST /api/v1/chat/stream, SSE): 流首 meta JSON 事件回传服务端实际使用的会话 ID, 其后事件均为增量 token.
 * 直接裸用 fetch 而非 [[api]]: 响应是事件流而非 `{code,message,data}` 壳, 无法走统一解包;
 * 但连接失败/非 200 仍降级为 [[ApiError]], AbortError 仍原样透传, 与 [[api]] 的错误约定保持一致.
 */
export async function streamMessage(opts: IStreamOptions): Promise<void>
{
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = getToken()
    if(token != null)
        headers.Authorization = `Bearer ${token}`

    let res: Response
    try
    {
        res = await fetch('/api/v1/chat/stream', {
            method: 'POST',
            headers,
            signal: opts.signal,
            body: JSON.stringify({ sessionId: opts.sessionId, content: opts.content }),
        })
    }
    catch(e)
    {
        //* AbortError 是调用方主动取消, 原样透传以区分"取消"与"故障" (判定方式与 [[api]] 逐字对齐).
        if(e instanceof Error && e.name === 'AbortError')
            throw e
        //! 网络中断/不可达时 fetch 抛裸 TypeError: 统一降级为 ApiError, 兑现调用方 catch(ApiError) 不漏接的约定.
        throw new ApiError(-1, '网络连接不可用, 请检查网络后重试')
    }
    if(!res.ok || res.body == null)
        throw new ApiError(res.status, `流式请求失败 (HTTP ${res.status})`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser(data => routeEvent(data, opts))
    try
    {
        for(;;)
        {
            const { done, value } = await reader.read()
            if(done)
            {
                //* 先冲刷解码器内残留的多字节半截序列: 若直接结束, 尾部中文 token 可能丢字.
                parser.push(decoder.decode())
                break
            }
            parser.push(decoder.decode(value, { stream: true }))
        }
        parser.end()
    }
    catch(e)
    {
        //* 读循环被中断或消费回调抛错时取消底层流, 防止连接与 reader 悬挂; cancel 自身的失败无需上报.
        void reader.cancel().catch(() => {})
        throw e
    }
}

//* meta 事件的结构化判据: type === 'meta' 且 sessionId 为 string.
function isMetaEvent(v: unknown): v is { sessionId: string }
{
    if(typeof v !== 'object' || v == null)
        return false
    const rec = v as Record<string, unknown>
    return rec.type === 'meta' && typeof rec.sessionId === 'string'
}

/**
 * SSE 事件路由: meta 事件 → onMeta (绑定会话), 其余一切 → onChunk.
 * meta 判定必须走结构化解析而非前缀匹配: 后端以 Map.of 序列化 meta, JSON 键序不保证
 * (`{"sessionId":...,"type":"meta"}` 与 `{"type":"meta",...}` 均会出现), startsWith 会漏判;
 * 反之, 碰巧可解析为 JSON 的普通 token (如 `{"foo":1}`) 不满足 meta 判据, 必须仍走 onChunk.
 */
function routeEvent(data: string, opts: IStreamOptions): void
{
    try
    {
        const v: unknown = JSON.parse(data)
        if(isMetaEvent(v))
        {
            opts.onMeta(v.sessionId)
            return
        }
    }
    catch
    {
        //* 纯文本 token 本就不是合法 JSON — 这是绝大多数事件的形态, 静默落入 onChunk.
    }
    opts.onChunk(data)
}

//endregion

//region 非流式降级与会话管理

//* 非流式降级路径: 响应即 ChatMessageVo (含 sessionId — 与流式 meta 事件对齐的会话绑定依据).
export const sendMessage = (sessionId: string | null, content: string) =>
    api<ChatMessageVo>('/api/v1/chat/send', { method: 'POST', body: { sessionId, content } })

export const listSessions = () => api<ChatSessionVo[]>('/api/v1/chat/sessions')

export const listMessages = (id: string) =>
    api<ChatHistoryMessage[]>(`/api/v1/chat/sessions/${id}/messages`)

export const deleteSession = (id: string) =>
    api<void>(`/api/v1/chat/sessions/${id}`, { method: 'DELETE' })

//endregion
