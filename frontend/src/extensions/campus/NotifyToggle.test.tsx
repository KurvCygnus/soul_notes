//* 扩展通知开关测试 (P3): 详情页"开启提醒" — 默认关 (契约 PUT-only 无读端点, opt-in 语义), 乐观翻转,
//* 失败回滚 + toast, 序号守卫挡陈旧失败回滚. api/ext 整体 mock 不触网络; toast 是模块级 store, 断言经 ToastHost.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../api/http'
import { setExtensionNotify } from '../../api/ext'
import { ExtNotifyToggle } from './NotifyToggle'
import { ToastHost } from '../../utils/toast'

vi.mock('../../api/ext', () => ({ setExtensionNotify: vi.fn() }))

const SWITCH = '开启提醒'

function renderToggle(): void
{
    render(<><ExtNotifyToggle name="timetable" /><ToastHost /></>)
}

function switchEl(): HTMLElement
{
    return screen.getByRole('switch', { name: SWITCH })
}

describe('ExtNotifyToggle (扩展通知开关)', () =>
{
    beforeEach(() => vi.clearAllMocks())
    afterEach(() =>
    {
        //* 点击即关 (toast 契约) 清模块级 store: cleanup 卸载组件不清理 store, 残留会串进后续用例的 status 断言.
        for(const el of [...document.querySelectorAll('[role="status"]')])
            fireEvent.click(el)
        cleanup()
    })

    it('默认关: 契约无读端点 (默认零通知), 挂载即关且不发请求', () =>
    {
        renderToggle()
        expect(switchEl()).toHaveAttribute('aria-checked', 'false')
        expect(setExtensionNotify).not.toHaveBeenCalled()
    })
    it('点开: 乐观即时翻 true 并 PUT (timetable, true)', async () =>
    {
        vi.mocked(setExtensionNotify).mockResolvedValue(undefined)
        const u = userEvent.setup()
        renderToggle()
        await u.click(switchEl())
        expect(switchEl()).toHaveAttribute('aria-checked', 'true')
        expect(setExtensionNotify).toHaveBeenCalledWith('timetable', true)
    })
    it('点开再点关: 两次 PUT 且末次携带 false, 终态回关', async () =>
    {
        vi.mocked(setExtensionNotify).mockResolvedValue(undefined)
        const u = userEvent.setup()
        renderToggle()
        await u.click(switchEl())
        await u.click(switchEl())
        expect(setExtensionNotify).toHaveBeenLastCalledWith('timetable', false)
        expect(switchEl()).toHaveAttribute('aria-checked', 'false')
    })
    it('PUT 失败: 回滚到失败前档位 + toast 错误提示 (开关不得与服务端事实脱节)', async () =>
    {
        vi.mocked(setExtensionNotify).mockRejectedValue(new ApiError(-1, '网络连接不可用'))
        const u = userEvent.setup()
        renderToggle()
        await u.click(switchEl())
        expect(switchEl()).toHaveAttribute('aria-checked', 'false')
        expect(screen.getByRole('status')).toHaveTextContent('开启提醒失败')
    })
    it('序号守卫: 连点开-关-开后最早一次 PUT 的迟到拒绝不得翻掉终态, 陈旧失败亦不 toast', async () =>
    {
        let rejectFirst!: (e: unknown) => void
        vi.mocked(setExtensionNotify).
            mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject })).
            mockResolvedValueOnce(undefined).
            mockResolvedValueOnce(undefined)
        const u = userEvent.setup()
        renderToggle()
        await u.click(switchEl())  //* 开: PUT 1 悬挂不落定.
        await u.click(switchEl())  //* 关: PUT 2 成功.
        await u.click(switchEl())  //* 开: PUT 3 成功, 终态开.
        expect(switchEl()).toHaveAttribute('aria-checked', 'true')
        await act(async () => { rejectFirst(new ApiError(-1, '网络连接不可用')) })  //* 陈旧失败迟到.
        expect(switchEl()).toHaveAttribute('aria-checked', 'true')  //* 陈旧回滚被序号守卫吞掉, 终态保持开.
        expect(screen.queryByRole('status')).not.toBeInTheDocument()  //* 陈旧失败静默让位, 不制造困惑提示.
    })
})
