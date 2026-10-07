import { afterEach, describe, expect, it, vi } from 'vitest'
import { pinSession, renameSession, streamMessage } from './chat'

//* 构造单帧一个 ReadableStream 的 SSE 响应, 供 fetch 打桩.
const sseResponse = (frames: string[]) => new Response(
  new ReadableStream<Uint8Array>({
    start(controller)
    {
      const encoder = new TextEncoder()
      for(const frame of frames)
        controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  }),
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
)

describe('streamMessage meta/token 路由', () =>
{
  afterEach(() =>
  {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('meta 以结构判定 (键序无关), 纯文本事件走 onChunk, 且携带 JWT', async () =>
  {
    localStorage.setItem('soul.token', 't-sse')
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      //* sessionId 键在前: 后端 Map.of 序列化键序不定, 前缀匹配式判 meta 必漏判 (本测试即为钉死该缺陷而存在).
      'data: {"sessionId":"abc","type":"meta"}\n\n',
      'data: 你好\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const onMeta = vi.fn()
    const onChunk = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta, onChunk })

    expect(onMeta).toHaveBeenCalledTimes(1)
    expect(onMeta).toHaveBeenCalledWith('abc')
    expect(onChunk).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledWith('你好')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t-sse')
  })

  it('可解析为 JSON 但非 meta 的事件仍是 token chunk', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['data: {"foo":1}\n\n'])))

    const onMeta = vi.fn()
    const onChunk = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta, onChunk })

    expect(onMeta).not.toHaveBeenCalled()
    expect(onChunk).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledWith('{"foo":1}')
  })

  it('followups 尾随事件走 onFollowups (不进正文), meta 照常路由 (Task 8)', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"meta","sessionId":"s8"}\n\n',
      'data: 回复正文\n\n',
      'data: {"type":"followups","items":["追问甲","追问乙","追问丙"]}\n\n',
    ])))

    const onMeta = vi.fn()
    const onChunk = vi.fn()
    const onFollowups = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta, onChunk, onFollowups })

    expect(onMeta).toHaveBeenCalledWith('s8')
    expect(onChunk).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledWith('回复正文')
    expect(onFollowups).toHaveBeenCalledTimes(1)
    expect(onFollowups).toHaveBeenCalledWith(['追问甲', '追问乙', '追问丙'])
  })

  it('followups 事件无处理回调时被吞掉, 绝不把契约 JSON 灌进聊天正文', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"followups","items":["甲","乙","丙"]}\n\n',
    ])))

    const onChunk = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta: vi.fn(), onChunk })

    expect(onChunk).not.toHaveBeenCalled()
  })

  it('形状不符的 followups (items 非数组) 不是契约事件, 仍按 token 处理', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"followups","items":"不是数组"}\n\n',
    ])))

    const onFollowups = vi.fn()
    const onChunk = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta: vi.fn(), onChunk, onFollowups })

    expect(onFollowups).not.toHaveBeenCalled()
    expect(onChunk).toHaveBeenCalledWith('{"type":"followups","items":"不是数组"}')
  })

  it('tool-call 过程事件走 onToolCall (携带扩展自定义 label), 不进正文 (工具调用可见性)', async () =>
  {
    //* name 键在前: 与 meta 用例同款哲学, 后端 Map.of 序列化键序不定, 结构化判定必须走解析.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"meta","sessionId":"s10"}\n\n',
      'data: {"name":"query_timetable","type":"tool-call","label":"正在查询课表…"}\n\n',
      'data: 回复正文\n\n',
    ])))

    const onMeta = vi.fn()
    const onChunk = vi.fn()
    const onToolCall = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta, onChunk, onToolCall })

    expect(onToolCall).toHaveBeenCalledTimes(1)
    expect(onToolCall).toHaveBeenCalledWith('正在查询课表…')
    expect(onChunk).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledWith('回复正文')
  })

  it('tool-call 事件无处理回调时被吞掉, 契约 JSON 绝不灌进聊天正文', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"tool-call","name":"query_exams","label":"正在查询考试安排…"}\n\n',
    ])))

    const onChunk = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta: vi.fn(), onChunk })

    expect(onChunk).not.toHaveBeenCalled()
  })

  it('形状不符的 tool-call (label 缺失) 不是契约事件, 仍按 token 处理', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"tool-call","name":"query_timetable"}\n\n',
    ])))

    const onToolCall = vi.fn()
    const onChunk = vi.fn()
    await streamMessage({ sessionId: null, content: 'hi', onMeta: vi.fn(), onChunk, onToolCall })

    expect(onToolCall).not.toHaveBeenCalled()
    expect(onChunk).toHaveBeenCalledWith('{"type":"tool-call","name":"query_timetable"}')
  })
})

//region 会话置顶与重命名 (Task 6 接口层, 端点 Task 8 后端落地)
describe('pinSession / renameSession (会话管理端点)', () =>
{
  afterEach(() =>
  {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('pinSession: POST /chat/sessions/{id}/pin, 返回服务端翻转后的 pinnedAt', async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, message: 'ok', data: { pinnedAt: '2026-10-05T10:00:00' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { pinnedAt } = await pinSession('s1')

    expect(pinnedAt).toBe('2026-10-05T10:00:00')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/chat/sessions/s1/pin')
    expect(init.method).toBe('POST')
  })

  it('pinSession: 取消置顶返回 null (服务端翻转语义, 前端不自行推断)', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, message: 'ok', data: { pinnedAt: null } }), { status: 200 })))

    const { pinnedAt } = await pinSession('s2')
    expect(pinnedAt).toBeNull()
  })

  it('renameSession: PUT /chat/sessions/{id}/title, JSON 体携带新标题', async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, message: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await renameSession('s1', '备考夜谈')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/chat/sessions/s1/title')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ title: '备考夜谈' }))
  })
})
//endregion
