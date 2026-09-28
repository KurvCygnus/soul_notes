import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamMessage } from './chat'

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
})
