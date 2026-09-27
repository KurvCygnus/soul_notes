//* 树洞对话接口: /api/v1/chat/* (非流式 / SSE 流式 / 会话列表 / 历史消息 / 删除会话)

import { api, ApiError, getToken } from './http'
import { sseEventData, takeSseEvents } from '../utils/sse'
import type { ApiResponse, ChatMessage, ChatSessionVo } from '../types'

export function listSessions(): Promise<ChatSessionVo[]> {
  return api<ChatSessionVo[]>('/chat/sessions')
}

export function listMessages(sessionId: string): Promise<ChatMessage[]> {
  return api<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
}

export function deleteSession(sessionId: string): Promise<void> {
  return api<void>(`/chat/sessions/${sessionId}`, { method: 'DELETE' })
}

export function sendMessage(sessionId: string | null, content: string): Promise<ChatMessage> {
  return api<ChatMessage>('/chat/send', { method: 'POST', body: { sessionId, content } })
}

export interface StreamOptions {
  sessionId: string | null
  content: string
  onChunk: (chunk: string) => void
  signal?: AbortSignal
}

//* SSE 流式回复: Quarkus 将 Multi<String> 的每项序列化为 "data: <chunk>" 一行, 逐块透传 AI token.
//! 后端流中不含 sessionId, 新会话的 id 需调用方在首轮回复后经会话列表回查 (见 ChatView 的续聊启发式).
export async function streamMessage(options: StreamOptions): Promise<void> {
  const { sessionId, content, onChunk, signal } = options

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch('/api/v1/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, content }),
    signal,
  })

  if (!res.ok) {
    let message = `流式请求失败 (HTTP ${res.status})`
    try {
      const payload = (await res.json()) as ApiResponse<unknown>
      message = payload.message || message
    } catch {
      //* 非 JSON 响应时保留默认文案
    }
    throw new ApiError(message, null, res.status)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new ApiError('当前浏览器不支持流式读取', null, res.status)

  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    //! 只按空行切完整事件: 同一事件的多条 data: 行属于同一段正文 (见 utils/sse.ts) ——
    //! 服务端把正文里的换行按规范拆成了多条 data: 行, 逐行当 chunk 会把换行吃掉.
    //! 跨 chunk 的半截事件留在 buffer 里等下一块, 拆开解析会把一段正文劈成两半.
    const { events, rest } = takeSseEvents(buffer)
    buffer = rest
    for (const event of events) {
      const chunk = sseEventData(event)
      if (chunk !== null) onChunk(chunk)
    }
  }
  //* 收尾: 服务端若没补末尾空行, 最后一段仍要吐出去, 否则最后几个字会丢.
  const tail = sseEventData(buffer)
  if (tail) onChunk(tail)
}
