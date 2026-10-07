import { afterEach, describe, expect, it, vi } from 'vitest'
import { alertSocketUrl, connectAlertSocket } from './ws'

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

  it('ext-notification 帧路由 (P3): 合法形状整帧透传第三回调, RED 链零沾染; 形状残缺静默丢弃', () =>
  {
    vi.stubGlobal('WebSocket', FakeSocket)
    const onRed = vi.fn()
    const onExt = vi.fn()
    connectAlertSocket('tk', onRed, onExt)

    const s = FakeSocket.all[0]
    s.onmessage?.({ data: '{"type":"ext-notification","title":"课表提醒","body":"15 分钟后有《高等数学》","tag":"ext:timetable"}' })
    expect(onExt).toHaveBeenCalledWith({ type: 'ext-notification', title: '课表提醒', body: '15 分钟后有《高等数学》', tag: 'ext:timetable' })
    expect(onRed).not.toHaveBeenCalled()
    //! 形状残缺 (缺 tag) 不算契约事件: 静默丢弃, 绝不降级进 RED 弹窗 (安全 UI 不可被坏帧误触).
    s.onmessage?.({ data: '{"type":"ext-notification","title":"残缺帧"}' })
    s.onmessage?.({ data: '{"type":"RED_ALERT","message":"预警照走旧路"}' })
    expect(onExt).toHaveBeenCalledTimes(1)
    expect(onRed).toHaveBeenCalledTimes(1)
  })

  it('ext-notification 回调缺席: 帧被安全消费 (仅传 onRed 的旧调用方零感知不抛错)', () =>
  {
    vi.stubGlobal('WebSocket', FakeSocket)
    const onRed = vi.fn()
    connectAlertSocket('tk', onRed)
    const s = FakeSocket.all[0]
    expect(() => s.onmessage?.({ data: '{"type":"ext-notification","title":"t","body":"b","tag":"g"}' })).not.toThrow()
    expect(onRed).not.toHaveBeenCalled()
  })
})

describe('alertSocketUrl', () =>
{
  it('alertSocketUrl: API_BASE 在场时从基址推导协议与主机, 空串时随页面 origin', () =>
  {
      expect(alertSocketUrl('https://api.example.com')).toBe('wss://api.example.com/ws/alert')
      expect(alertSocketUrl('http://10.0.2.2:8080')).toBe('ws://10.0.2.2:8080/ws/alert')
      expect(alertSocketUrl('http://10.0.2.2:8080/')).toBe('ws://10.0.2.2:8080/ws/alert')  //* 尾斜杠容忍
      expect(alertSocketUrl('')).toBe('ws://localhost:3000/ws/alert')
  })
})
