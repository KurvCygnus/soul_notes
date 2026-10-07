//* 会话菜单测试 (Task 6): 长按/右键呼出的行级弹层 — 置顶动态文案 / 三项上抛即关 / Escape 与遮罩关闭 / 触发行定位.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SessionMenu from './SessionMenu'

function renderMenu(overrides: Partial<Parameters<typeof SessionMenu>[0]> = {}): void
{
    const props = {
        pinned: false,
        x: 120,
        y: 80,
        onClose: vi.fn(),
        onPin: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    }
    render(<SessionMenu {...props} />)
}

describe('SessionMenu (会话行菜单)', () =>
{
    afterEach(cleanup)

    it('未置顶会话: 菜单显示 "置顶" (动态文案), 三项齐备且带 stroke 图标', () =>
    {
        renderMenu()
        expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: '置顶' })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: '取消置顶' })).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: '重命名' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument()
        expect(screen.getByRole('menu', { name: '会话菜单' }).querySelectorAll('svg')).toHaveLength(3)
    })

    it('已置顶会话: 首项翻转为 "取消置顶"', () =>
    {
        renderMenu({ pinned: true })
        expect(screen.getByRole('menuitem', { name: '取消置顶' })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: '置顶' })).not.toBeInTheDocument()
    })

    it('点置顶: 上抛 onPin 恰一次并关闭菜单 (onClose), 不误触其余动作', async () =>
    {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onPin = vi.fn()
        const onRename = vi.fn()
        const onDelete = vi.fn()
        renderMenu({ onClose, onPin, onRename, onDelete })
        await user.click(screen.getByRole('menuitem', { name: '置顶' }))
        expect(onPin).toHaveBeenCalledOnce()
        expect(onClose).toHaveBeenCalledOnce()
        expect(onRename).not.toHaveBeenCalled()
        expect(onDelete).not.toHaveBeenCalled()
    })

    it('点重命名/删除: 各自上抛并关闭, 删除不直接执行 (语义 = 请求, 确认归壳)', async () =>
    {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onRename = vi.fn()
        const onDelete = vi.fn()
        renderMenu({ onClose, onRename, onDelete })
        await user.click(screen.getByRole('menuitem', { name: '重命名' }))
        expect(onRename).toHaveBeenCalledOnce()
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(onDelete).not.toHaveBeenCalled()
    })

    it('Escape 与遮罩点击: 只关不动作', async () =>
    {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onPin = vi.fn()
        renderMenu({ onClose, onPin })
        await user.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledOnce()
        fireEvent.click(document.querySelector('.session-menu-mask')!)
        expect(onClose).toHaveBeenCalledTimes(2)
        expect(onPin).not.toHaveBeenCalled()
    })

    it('触发行定位: 面板 fixed 坐标即调用方传入的 x/y (不做跟随, 固定弹出)', () =>
    {
        renderMenu({ x: 120, y: 80 })
        const menu = screen.getByRole('menu', { name: '会话菜单' })
        expect(menu.style.top).toBe('80px')
        expect(menu.style.left).toBe('120px')
    })
})
