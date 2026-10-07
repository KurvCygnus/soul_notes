import { describe, expect, it, vi } from 'vitest'
import { overlayClosed, overlayOpened, overlayResync, onOverlayPopstate, sentinelActive } from './overlayHistory'

describe('浮层返回哨兵', () =>
{
    it('首次 opened 压一个哨兵 entry, 重复 opened 不重复压栈', () =>
    {
        const before = history.length
        overlayOpened()
        overlayOpened()
        expect(history.length - before).toBe(1)
        expect(sentinelActive()).toBe(true)
    })

    it('closed 收回哨兵并触发一次 popstate', async () =>
    {
        overlayOpened()
        const handler = vi.fn()
        const off = onOverlayPopstate(handler)
        overlayClosed()
        await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
        expect(sentinelActive()).toBe(false)
        off()
    })

    it('空栈 closed 是幂等空操作 (不产生历史移动)', () =>
    {
        const before = history.length
        overlayClosed()
        expect(history.length).toBe(before)
        expect(sentinelActive()).toBe(false)
    })

    it('resync 重推一个哨兵 entry 且不改变量语义 (RED 持有计数时变量仍 1, opened 已 no-op)', () =>
    {
        overlayOpened()
        const before = history.length
        overlayResync()
        expect(history.length - before).toBe(1)
        expect(sentinelActive()).toBe(true)
        overlayClosed()  //* 收尾归零: 变量与 entry 同帧收干净, 不给后续用例留残留.
    })
})
