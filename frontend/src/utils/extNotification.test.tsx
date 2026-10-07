//* 扩展通知投递路由测试 (P3): 前台 (WebView 可见) 走应用内横幅 (ToastHost 体系, 加长驻留) 且绝不调壳桥 —
//* 防系统通知与横幅双响; 后台 (不可见) 调壳桥 notify(tag,title,body) 发系统通知; 壳桥缺席 (纯浏览器/旧壳) 静默零影响.
//* visibilityState 经 defineProperty 桩 (jsdom 恒 visible, 用例自管复位); toast 是模块级 store, 横幅断言经 ToastHost 渲染.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { deliverExtNotification, EXT_NOTIFICATION_BANNER_MS } from './extNotification'
import { ToastHost } from './toast'

const MSG = { title: '课表提醒', body: '15 分钟后有《高等数学》', tag: 'ext:timetable' }
const BANNER = `${MSG.title} · ${MSG.body}`

function stubVisibility(state: 'visible' | 'hidden'): void
{
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('deliverExtNotification (ext-notification 终端路由)', () =>
{
    afterEach(() =>
    {
        cleanup()
        delete window.AndroidShellNotify
        stubVisibility('visible')  //* jsdom 缺省即 visible: 复位归零, 用例间不串扰.
        vi.useRealTimers()
    })

    it('前台横幅: 可见态走应用内横幅且壳桥在场也不调用 (防双响), 驻留长于普通 toast (3.2s 到点仍在场)', () =>
    {
        vi.useFakeTimers()
        stubVisibility('visible')
        const notify = vi.fn()
        window.AndroidShellNotify = { notify }
        render(<ToastHost />)
        act(() => deliverExtNotification(MSG))
        expect(screen.getByText(BANNER)).toBeInTheDocument()
        expect(notify).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(3200) })
        expect(screen.getByText(BANNER)).toBeInTheDocument()  //* 普通 toast 已到点退场的时刻, 通知横幅仍在驻留.
        act(() => { vi.advanceTimersByTime(EXT_NOTIFICATION_BANNER_MS - 3200) })
        expect(screen.queryByText(BANNER)).not.toBeInTheDocument()  //* 加长档到点退场.
    })

    it('后台壳桥: 不可见态调 AndroidShellNotify.notify(tag, title, body), 不出应用内横幅', () =>
    {
        stubVisibility('hidden')
        const notify = vi.fn()
        window.AndroidShellNotify = { notify }
        render(<ToastHost />)
        act(() => deliverExtNotification(MSG))
        expect(notify).toHaveBeenCalledOnce()
        expect(notify).toHaveBeenCalledWith(MSG.tag, MSG.title, MSG.body)
        expect(screen.queryByText(/课表提醒/)).not.toBeInTheDocument()  //* 后台态横幅无意义 (无人看), 不产生.
    })

    it('钩子缺席静默: 不可见态无壳桥 (纯浏览器/旧壳) 不抛错零影响', () =>
    {
        stubVisibility('hidden')
        expect(() => deliverExtNotification(MSG)).not.toThrow()
    })
})
