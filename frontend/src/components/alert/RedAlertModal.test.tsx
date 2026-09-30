//* RED 预警弹窗冒烟: 安全模态语义 (alertdialog + 显式确认, Escape 不关闭), 首屏不等网络 (默认号码先绘),
//* 缓存到达原位刷新, alert.hotline (服务端随帧下发) 优先于缓存, 预约入口按 appointmentUrl 判空显隐.
//* api/hotline 用 importOriginal 局部 mock: 只替换 getCachedHotline 控制时序, DEFAULT_HOTLINE 保持真身.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getCachedHotline } from '../../api/hotline'
import RedAlertModal from './RedAlertModal'
import type { HotlineInfo } from '../../types'

vi.mock('../../api/hotline', async (importOriginal) =>
{
    return { ...(await importOriginal<typeof import('../../api/hotline')>()), getCachedHotline: vi.fn() }
})

const CACHED: HotlineInfo = {
    name: '校园心理中心热线',
    primary: '010-88886666',
    backup: '021-12345678',
    message: '随时都在',
    appointmentUrl: 'https://counsel.example.com/book',
}

function mount(
    alert: Parameters<typeof RedAlertModal>[0]['alert'],
    onClose = vi.fn(),
    onOpenResources?: () => void,
): ReturnType<typeof render>
{
    return render(<RedAlertModal alert={alert} onClose={onClose} onOpenResources={onOpenResources} />)
}

describe('RedAlertModal (RED 预警弹窗)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('安全模态语义完整: role=alertdialog + aria-modal, 主热线 tel: 大按钮, 首屏即为默认号码 (缓存未达也先绘)', () =>
    {
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>(() => {}))//* 永不 resolve: 模拟零网络
        const onClose = vi.fn()
        mount({ type: 'RED_ALERT', reason: '我们注意到你最近可能承受着很大的压力' }, onClose)
        const dialog = screen.getByRole('alertdialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(screen.getByText('我们注意到你最近可能承受着很大的压力')).toBeInTheDocument()
        const call = screen.getByRole('link', { name: /400-161-9995/ })
        expect(call).toHaveAttribute('href', 'tel:400-161-9995')
        expect(screen.getByText('12355')).toBeInTheDocument()//* 备用热线展示
        expect(screen.getByRole('button', { name: '我知道了' })).toBeInTheDocument()
        expect(call).toHaveFocus()//* 打开即聚焦主按钮 (键盘/读屏用户第一落点)
    })

    it('缓存到达后原位刷新为最新号码, 不阻塞首绘', async () =>
    {
        let resolve!: (info: HotlineInfo) => void
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>((r) => { resolve = r }))
        mount({ type: 'RED_ALERT' })
        expect(screen.getByRole('link', { name: /400-161-9995/ })).toBeInTheDocument()
        resolve(CACHED)
        expect(await screen.findByRole('link', { name: /010-88886666/ })).toHaveAttribute('href', 'tel:010-88886666')
        expect(screen.getByText('021-12345678')).toBeInTheDocument()
    })

    it('服务端随帧下发的 alert.hotline 优先于缓存号码', async () =>
    {
        vi.mocked(getCachedHotline).mockResolvedValue(CACHED)
        mount({ type: 'RED_ALERT', hotline: '010-00000000' })
        expect(screen.getByRole('link', { name: /010-00000000/ })).toHaveAttribute('href', 'tel:010-00000000')
        await screen.findByRole('link', { name: '021-12345678' })//* 缓存刷新在 act 内落定 (消 act 警告), 优先级不被覆盖
        expect(screen.getByRole('link', { name: /010-00000000/ })).toHaveAttribute('href', 'tel:010-00000000')
    })

    it('预约入口按 appointmentUrl 判空显隐', async () =>
    {
        vi.mocked(getCachedHotline).mockResolvedValue(CACHED)
        const first = mount({ type: 'RED_ALERT' })
        expect(await screen.findByRole('link', { name: '预约学校心理咨询' })).toHaveAttribute('href', CACHED.appointmentUrl)
        first.unmount()//* 同测两态: 先卸载非空用例, 避免两次挂载的节点互相污染缺席断言

        vi.mocked(getCachedHotline).mockResolvedValue({ ...CACHED, appointmentUrl: '' })
        mount({ type: 'RED_ALERT' })
        await screen.findByRole('link', { name: /400-161-9995/ })//* 第二次挂载等待缓存刷新完成
        expect(screen.queryByRole('link', { name: '预约学校心理咨询' })).not.toBeInTheDocument()
    })

    it('我知道了显式关闭; Escape 不关闭 (安全模态必须显式确认); 查看全部求助资源上抛壳 (壳关 RED 开 Flyout, 弹层自身不关)', async () =>
    {
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>(() => {}))
        const onClose = vi.fn()
        const onOpenResources = vi.fn()
        const u = userEvent.setup()
        const view = mount({ type: 'RED_ALERT', reason: 'r' }, onClose, onOpenResources)

        await u.keyboard('{Escape}')
        expect(onClose).not.toHaveBeenCalled()//* 产品红线: Escape 不关闭, 防止误触跳过求助信息

        await u.click(screen.getByRole('button', { name: '查看全部求助资源' }))
        expect(onOpenResources).toHaveBeenCalledOnce()
        expect(onClose).not.toHaveBeenCalled()//* 上抛不自带关闭: RED -> Flyout 交替由壳一次性完成
        view.unmount()

        //! 未接线兜底: onOpenResources 缺席时至少关 RED, 安全出口绝不悬空.
        mount({ type: 'RED_ALERT', reason: 'r' }, onClose)
        await u.click(screen.getByRole('button', { name: '查看全部求助资源' }))
        expect(onClose).toHaveBeenCalledOnce()

        await u.click(screen.getByRole('button', { name: '我知道了' }))
        expect(onClose).toHaveBeenCalledTimes(2)
    })
})
