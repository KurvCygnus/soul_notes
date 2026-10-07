//* 重命名弹层测试 (Task 6): 初始值回灌 / 空值与超长禁提交 + 提示 / trimmed 上抛 / 取消三路 (钮/Escape/遮罩).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RenameDialog from './RenameDialog'

function renderDialog(overrides: Partial<Parameters<typeof RenameDialog>[0]> = {}): void
{
    const props = {
        sessionId: 's1',
        initialTitle: '备考夜谈',
        onClose: vi.fn(),
        onRename: vi.fn(),
        ...overrides,
    }
    render(<RenameDialog {...props} />)
}

describe('RenameDialog (会话重命名弹层)', () =>
{
    afterEach(cleanup)

    it('开启即聚焦输入框且回灌当前标题 (对话续写体验: 全选改写起点)', () =>
    {
        renderDialog()
        const input = screen.getByRole('textbox', { name: '会话标题' }) as HTMLInputElement
        expect(input.value).toBe('备考夜谈')
        expect(input).toHaveFocus()
    })

    it('空值/纯空白: 保存禁用 + 提示在场', async () =>
    {
        const user = userEvent.setup()
        renderDialog()
        const save = screen.getByRole('button', { name: '保存' })
        expect(save).toBeEnabled()
        fireEvent.change(screen.getByRole('textbox', { name: '会话标题' }), { target: { value: '   ' } })
        expect(save).toBeDisabled()
        expect(screen.getByText('标题不能为空')).toBeInTheDocument()
        await user.click(save)
        expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()  //* 禁用态点击不穿透 (userEvent 不派发).
    })

    it('超长 (>100 字): 保存禁用 + 提示在场; 恰 100 字可用', () =>
    {
        renderDialog()
        const save = screen.getByRole('button', { name: '保存' })
        const input = screen.getByRole('textbox', { name: '会话标题' })
        fireEvent.change(input, { target: { value: '长'.repeat(101) } })
        expect(save).toBeDisabled()
        expect(screen.getByText('标题过长, 最多 100 字')).toBeInTheDocument()
        fireEvent.change(input, { target: { value: '长'.repeat(100) } })
        expect(save).toBeEnabled()
    })

    it('提交: 上抛 onRename(sessionId, trimmed) — 首尾空白不入库', async () =>
    {
        const user = userEvent.setup()
        const onRename = vi.fn()
        renderDialog({ onRename })
        fireEvent.change(screen.getByRole('textbox', { name: '会话标题' }), { target: { value: '  新标题  ' } })
        await user.click(screen.getByRole('button', { name: '保存' }))
        expect(onRename).toHaveBeenCalledOnce()
        expect(onRename).toHaveBeenCalledWith('s1', '新标题')
    })

    it('Enter 提交 (合法时), 取消钮/Escape/遮罩点击三路只关不提交', async () =>
    {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onRename = vi.fn()
        renderDialog({ onClose, onRename })
        fireEvent.keyDown(screen.getByRole('textbox', { name: '会话标题' }), { key: 'Enter' })
        expect(onRename).toHaveBeenCalledOnce()

        await user.click(screen.getByRole('button', { name: '取消' }))
        expect(onClose).toHaveBeenCalledTimes(1)
        await user.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledTimes(2)
        fireEvent.click(document.querySelector('.rename-dialog')!)
        expect(onClose).toHaveBeenCalledTimes(3)
        expect(onRename).toHaveBeenCalledTimes(1)
    })
})
