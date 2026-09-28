import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectAlertSocket } from './ws'

//* 最小 WebSocket 桩: 只实现 [[connectAlertSocket]] 触碰的表面 (构造/on* 回调/close 同步触发 onclose).
class FakeSocket
{
  static all: FakeSocket[] = []
  url = ''
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) { this.url = url; FakeSocket.all.push(this) }
  close() { this.onclose?.() }
}

describe('connectAlertSocket', () =>
{
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); FakeSocket.all = [] })

  it('后端 message 别名为 reason, 关闭函数撤销重连定时器', () =>
  {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    const onRed = vi.fn()
    const close = connectAlertSocket('tk', onRed)

    const s1 = FakeSocket.all[0]
    expect(s1.url).toContain('/ws/alert?token=tk')
    s1.onmessage?.({ data: '{"type":"RED_ALERT","message":"请立即联系热线","hotline":"021"}' })
    expect(onRed).toHaveBeenCalledWith(expect.objectContaining({ reason: '请立即联系热线', hotline: '021', message: '请立即联系热线' }))

    s1.onclose?.()
    vi.advanceTimersByTime(3000)
    expect(FakeSocket.all).toHaveLength(2)//* 断开后退避到点确实重连, 证明下一条断言非空转

    close()
    vi.advanceTimersByTime(60000)
    expect(FakeSocket.all).toHaveLength(2)//* 关闭后定时器被撤销, 不再新建连接
  })
})
