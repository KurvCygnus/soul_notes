//* 对话域 API: SSE 流式主路径 + 非流式降级与会话管理.
//! 路径均为全量 `/api/v1/...`: [[api]] 不做前缀拼接, 依赖 Vite/网关按 `/api` 前缀转发, 半路径会绕过代理.
import { API_BASE, ApiError, api, getToken } from './http'
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
    //* 流尾 followups 尾随事件 (Task 8): 候选追问 0-3 条, 生成失败/空产物时服务端不发事件 — 回调可选.
    onFollowups?: (items: string[]) => void
    //* 流中 tool-call 过程事件 (工具调用可见性): LLM 发起工具调用时服务端下发扩展自定义的进行时文案
    //* (如 "正在查询课表…"), 展示在思考指示中; 事件缺失时调用方回落 "思考中" — 回调可选.
    onToolCall?: (label: string) => void
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
        res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
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

//* followups 事件的结构化判据 (Task 8): type === 'followups' 且 items 为纯字符串数组.
//* 形状不符 (items 缺失/非数组/含非字符串) 即不算契约事件 — 落回 onChunk, 宁可原文可见也不静默丢内容.
function isFollowupsEvent(v: unknown): v is { items: string[] }
{
    if(typeof v !== 'object' || v == null)
        return false
    const rec = v as Record<string, unknown>
    return rec.type === 'followups' && Array.isArray(rec.items) && rec.items.every(x => typeof x === 'string')
}

//* tool-call 过程事件的结构化判据 (工具调用可见性): type === 'tool-call' 且 label 为非空字符串.
//* 形状不符 (label 缺失/非字符串) 不算契约事件 — 落回 onChunk, 与 followups 同一容错口径.
function isToolCallEvent(v: unknown): v is { label: string }
{
    if(typeof v !== 'object' || v == null)
        return false
    const rec = v as Record<string, unknown>
    return rec.type === 'tool-call' && typeof rec.label === 'string' && rec.label !== ''
}

/**
 * SSE 事件路由: meta 事件 → onMeta (绑定会话), tool-call 过程事件 → onToolCall (工具调用可见性),
 * followups 尾随事件 → onFollowups (候选追问, Task 8), 其余一切 → onChunk.
 * 结构化判定必须走解析而非前缀匹配: 后端以 Map.of 序列化契约事件, JSON 键序不保证,
 * startsWith 会漏判; 反之, 碰巧可解析为 JSON 的普通 token (如 `{"foo":1}`) 不满足契约判据, 必须仍走 onChunk.
 * 合法契约事件即便无处理回调也消费掉 (不回落 onChunk): 契约 JSON 灌进聊天正文是内容事故.
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
        if(isToolCallEvent(v))
        {
            opts.onToolCall?.(v.label)
            return
        }
        if(isFollowupsEvent(v))
        {
            opts.onFollowups?.(v.items)
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

//* 置顶翻转 (Task 6 接口先行, 端点 Task 8 后端落地): 服务端按当前态翻转, 返回翻转后的 pinnedAt
//* (非空 = 已置顶的时间戳, null = 已取消) — 前端不自行推断新状态, 一律以响应为准.
export const pinSession = (id: string): Promise<{ pinnedAt: string | null }> =>
    api<{ pinnedAt: string | null }>(`/api/v1/chat/sessions/${id}/pin`, { method: 'POST' })

//* 会话重命名 (Task 6 接口先行): PUT 新标题, 成功即 void (列表展示由调用方本地落定/刷新承接).
export const renameSession = (id: string, title: string): Promise<void> =>
    api<void>(`/api/v1/chat/sessions/${id}/title`, { method: 'PUT', body: { title } })

//endregion
