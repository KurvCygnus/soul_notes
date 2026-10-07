//* 危机 Flyout 测试 (产品红线): 居中浮层语义 (dialog + aria-modal + labelled), 首屏即默认兜底号码
//* (getCachedHotline 永不 resolve 的挂起态也不空窗), 缓存到达原位刷新, 预约卡按 appointmentUrl 判空显隐,
//* 三路关闭 (我知道了/Escape/遮罩), 焦点管理 (开即聚焦主号码, 关后还原给触发元素), 层级常量断言.
//* api/hotline 用 importOriginal 局部 mock: 只替换 getCachedHotline 控制时序, DEFAULT_HOTLINE 保持真身.
//* 层级断言经 fs 直读 base.css 源文本 (vitest 对 ?raw 的 CSS 导入返回空 stub, 不可用).
//* tsconfig types 仅含 vite/client, 此处按文件级三斜线按需引入 node 类型, 不放宽全局配置.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getCachedHotline } from '../../api/hotline'
import CrisisFlyout from './CrisisFlyout'
import type { HotlineInfo } from '../../types'

vi.mock('../../api/hotline', async (importOriginal) =>
{
    return { ...(await importOriginal<typeof import('../../api/hotline')>()), getCachedHotline: vi.fn() }
})

const CACHED: HotlineInfo = {
    name: '校园心理中心热线',
    primary: '010-88886666',
    backup: '021-12345678',
    message: '工作日 8:00-22:00',
    appointmentUrl: 'https://counsel.example.com/book',
}

//* vitest 的模块 runner 下 import.meta.url 非 file scheme, 经 process.cwd() (vite 配置所在目录) 定位样式表.
const BASE_CSS = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')

//* 带常驻触发钮的挂载器: 触发钮是焦点还原断言的落点 (壳内真实触发元 - 菜单项 - 会随菜单卸载,
//* 这里用不卸载的钮单测还原机制本身).
function FlyoutHarness(): ReactElement
{
    const [open, setOpen] = useState(false)
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>触发入口</button>
            <CrisisFlyout open={open} onClose={() => setOpen(false)} />
        </>
    )
}

async function openFlyout(): Promise<void>
{
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '触发入口' }))
}

describe('CrisisFlyout (危机支持居中浮层)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('open=false: 不渲染任何浮层节点, 也不发起缓存取数', () =>
    {
        render(<CrisisFlyout open={false} onClose={vi.fn()} />)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(getCachedHotline).not.toHaveBeenCalled()
    })

    it('open=true: dialog 语义完整, 默认热线首绘 (挂起态不空窗), 焦点落主号码', async () =>
    {
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>(() => {}))//* 永不 resolve: 模拟零网络
        render(<FlyoutHarness />)
        await openFlyout()
        const dlg = screen.getByRole('dialog', { name: '危机支持' })
        expect(dlg).toHaveAttribute('aria-modal', 'true')
        expect(screen.getByRole('link', { name: '400-161-9995' })).toHaveAttribute('href', 'tel:400-161-9995')
        expect(screen.getByRole('link', { name: '12355' })).toHaveAttribute('href', 'tel:12355')
        expect(screen.getByText(/110 或 120/)).toBeInTheDocument()
        expect(screen.queryByRole('region', { name: '预约心理咨询' })).not.toBeInTheDocument()//* 默认无预约入口
        expect(screen.getByRole('link', { name: '400-161-9995' })).toHaveFocus()//* 打开即聚焦主号码
    })

    it('缓存到达: 原位刷新为 API 数据 (名称/号码/寄语), appointmentUrl 非空渲染预约入口卡', async () =>
    {
        //* 受控 deferred: 先锁定首绘默认兜底, 再放行缓存 — 时序确定, 不赌微任务冲刷点.
        let resolve!: (info: HotlineInfo) => void
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>((r) => { resolve = r }))
        render(<FlyoutHarness />)
        await openFlyout()
        expect(screen.getByRole('link', { name: '400-161-9995' })).toBeInTheDocument()//* 首绘默认兜底
        resolve(CACHED)
        expect(await screen.findByRole('link', { name: '010-88886666' })).toHaveAttribute('href', 'tel:010-88886666')
        expect(screen.getByRole('heading', { name: '校园心理中心热线' })).toBeInTheDocument()
        expect(screen.getByText('工作日 8:00-22:00')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: '预约心理咨询' })).
            toContainElement(screen.getByRole('link', { name: '前往预约入口' }))
    })

    it('预约入口按 appointmentUrl 判空显隐 (同测两态)', async () =>
    {
        vi.mocked(getCachedHotline).mockResolvedValue(CACHED)
        const first = render(<FlyoutHarness />)
        await openFlyout()
        expect(await screen.findByRole('link', { name: '前往预约入口' })).toHaveAttribute('href', CACHED.appointmentUrl)
        first.unmount()//* 先卸载非空用例, 避免两次挂载的节点互相污染缺席断言

        vi.mocked(getCachedHotline).mockResolvedValue({ ...CACHED, appointmentUrl: '' })
        render(<FlyoutHarness />)
        await openFlyout()
        await screen.findByRole('link', { name: '010-88886666' })//* 等缓存刷新完成再断缺席
        expect(screen.queryByRole('region', { name: '预约心理咨询' })).not.toBeInTheDocument()
    })

    it('三路关闭各一次: 我知道了 / Escape / 遮罩点击 (各自全新挂载, 计数累计)', async () =>
    {
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>(() => {}))
        const onClose = vi.fn()
        const user = userEvent.setup()

        const first = render(<CrisisFlyout open onClose={onClose} />)
        await user.click(screen.getByRole('button', { name: '我知道了' }))
        expect(onClose).toHaveBeenCalledTimes(1)
        first.unmount()

        const second = render(<CrisisFlyout open onClose={onClose} />)
        await user.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledTimes(2)
        second.unmount()

        render(<CrisisFlyout open onClose={onClose} />)
        await user.click(screen.getByRole('dialog', { name: '危机支持' }))//* 直点遮罩 (面板不在命中路径)
        expect(onClose).toHaveBeenCalledTimes(3)
    })

    it('遮罩与面板分离: 点面板内不触发遮罩关闭', async () =>
    {
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>(() => {}))
        const onClose = vi.fn()
        const user = userEvent.setup()
        render(<CrisisFlyout open onClose={onClose} />)
        await user.click(screen.getByRole('heading', { name: '危机支持' }))//* 面板内部冒泡被截停
        expect(onClose).not.toHaveBeenCalled()
    })

    it('焦点还原: 关闭后焦点回到打开前的触发元素', async () =>
    {
        vi.mocked(getCachedHotline).mockReturnValue(new Promise<HotlineInfo>(() => {}))
        render(<FlyoutHarness />)
        const user = userEvent.setup()
        const trigger = screen.getByRole('button', { name: '触发入口' })
        await user.click(trigger)
        expect(screen.getByRole('link', { name: '400-161-9995' })).toHaveFocus()//* 开: 焦点移交主号码
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(trigger).toHaveFocus()//* 关: 焦点还原给触发元素
    })

    it('层级阶梯: .crisis-flyout z-index 85 (压过抽屉 80/登录 60), RED 预警 100 仍在其上', () =>
    {
        const flyoutRule = BASE_CSS.match(/\.crisis-flyout\s*{[^}]*}/)![0]
        const redRule = BASE_CSS.match(/\.red-alert-overlay\s*{[^}]*}/)![0]
        const flyoutZ = Number(flyoutRule.match(/z-index:\s*(\d+)/)![1])
        const redZ = Number(redRule.match(/z-index:\s*(\d+)/)![1])
        expect(flyoutZ).toBe(85)
        expect(redZ).toBe(100)
        expect(flyoutZ).toBeLessThan(redZ)
    })
})
