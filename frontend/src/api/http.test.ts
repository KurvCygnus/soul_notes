import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, setUnauthorizedHandler } from './http'

const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, message: 'ok', data }), { status: 200 })

describe('api()', () =>
{
  afterEach(() => vi.unstubAllGlobals())

  it('解包 data 壳并携带 JWT', async () =>
  {
    localStorage.setItem('soul.token', 't123')
    const fetchMock = vi.fn().mockResolvedValue(ok({ hello: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api<{ hello: number }>('/chat/sessions')).resolves.toEqual({ hello: 1 })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t123')
  })

  it('业务失败抛 ApiError(code/message)', async () =>
  {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 40001, message: '会话不存在', data: null }), { status: 200 })))
    await expect(api('/chat/sessions/x')).rejects.toMatchObject({ message: '会话不存在' })
  })

  it('401 触发全局回调', async () =>
  {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    await expect(api('/chat/sessions')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
