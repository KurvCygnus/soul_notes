//* 删除确认模态测试 (Task 11, D17 无预览契约): alertdialog 语义 (modal + labelled/described),
//* 三路取消 (Escape/遮罩/取消钮) 与单路确认 (确认钮恰一次上抛, 组件不自作主张关闭), 破坏性默认安全
//* (开即聚焦取消钮, 关后焦点还原触发元), 组件不提供 children/预览插槽 (传入即编译错误 + 运行时不渲染),
//* 层级阶梯断言经 fs 直读 base.css 源文本 (vitest 对 ?raw 的 CSS 导入返回空 stub, 不可用 — CrisisFlyout 同款).
//* tsconfig types 仅含 vite/client, 此处按文件级三斜线按需引入 node 类型, 不放宽全局配置.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmModal from './ConfirmModal'

//* vitest 的模块 runner 下 import.meta.url 非 file scheme, 经 process.cwd() (vite 配置所在目录) 定位样式表.
const BASE_CSS = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')

const BASE = {
    open: true,
    title: '删除这条会话?',
    body: '删除后不可恢复',
    confirmText: '删除',
    danger: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
}

//* 带常驻触发钮的挂载器: 触发钮是焦点还原断言的落点 (壳内真实触发元 - 删除 × - 不随模态卸载, 机制同款可验).
function ConfirmHarness(): ReactElement
{
    const [open, setOpen] = useState(false)
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>触发入口</button>
            <ConfirmModal
                open={open}
                title="删除这条会话?"
                body="删除后不可恢复"
                confirmText="删除"
                danger
                onClose={() => setOpen(false)}
                onConfirm={vi.fn()}
            />
        </>
    )
}

describe('ConfirmModal (删除确认模态)', () =>
{
    beforeEach(() => vi.clearAllMocks())

    it('open=false: 不渲染任何模态节点', () =>
    {
        render(<ConfirmModal open={false} title="删除这条会话?" body="删除后不可恢复" onClose={vi.fn()} onConfirm={vi.fn()} />)
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('open=true: alertdialog 语义完整 (modal/labelledby/describedby), 渲染 title/body 与 取消+删除 双钮, 焦点落取消钮', () =>
    {
        render(<ConfirmModal {...BASE} />)
        const dlg = screen.getByRole('alertdialog', { name: '删除这条会话?' })
        expect(dlg).toHaveAttribute('aria-modal', 'true')
        expect(dlg).toHaveAttribute('aria-describedby', 'confirm-modal-body')
        expect(screen.getByText('删除后不可恢复')).toHaveAttribute('id', 'confirm-modal-body')
        expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()//* 破坏性操作默认安全: 焦点不落危险钮.
    })

    it('danger=false: 确认钮不带 danger 危险色类', () =>
    {
        render(<ConfirmModal {...BASE} danger={false} />)
        expect(screen.getByRole('button', { name: '删除' })).not.toHaveClass('confirm-modal-danger')
    })

    it('三路取消各一次: 取消钮 / Escape / 遮罩点击 (各自全新挂载, 计数累计), 确认钮路径不受扰', async () =>
    {
        const user = userEvent.setup()

        const first = render(<ConfirmModal {...BASE} />)
        await user.click(screen.getByRole('button', { name: '取消' }))
        expect(BASE.onClose).toHaveBeenCalledTimes(1)
        first.unmount()

        const second = render(<ConfirmModal {...BASE} />)
        await user.keyboard('{Escape}')
        expect(BASE.onClose).toHaveBeenCalledTimes(2)
        second.unmount()

        render(<ConfirmModal {...BASE} />)
        await user.click(screen.getByRole('alertdialog', { name: '删除这条会话?' }))//* 直点遮罩 (面板不在命中路径)
        expect(BASE.onClose).toHaveBeenCalledTimes(3)
    })

    it('遮罩与面板分离: 点面板内不触发遮罩关闭', async () =>
    {
        const user = userEvent.setup()
        render(<ConfirmModal {...BASE} />)
        await user.click(screen.getByRole('heading', { name: '删除这条会话?' }))
        expect(BASE.onClose).not.toHaveBeenCalled()
    })

    it('确认: 点删除钮 onConfirm 恰好一次; 组件不自行调用 onClose (关闭裁决归壳)', async () =>
    {
        const user = userEvent.setup()
        render(<ConfirmModal {...BASE} />)
        await user.click(screen.getByRole('button', { name: '删除' }))
        expect(BASE.onConfirm).toHaveBeenCalledTimes(1)
        expect(BASE.onClose).not.toHaveBeenCalled()
    })

    it('D17 无预览契约: 组件不提供 children/预览插槽, 传入的会话内容绝不渲染 (TS 层由 build 兜底拒绝)', () =>
    {
        const withChildren = { ...BASE }
        render(
            //* @ts-expect-error D17: props 不含 children, 传入即编译错误 (tsc --noEmit 兜底); 运行时断言双保险.
            <ConfirmModal {...withChildren}>
                <p>最近的考试压力 (会话预览, 禁止渲染)</p>
            </ConfirmModal>,
        )
        expect(screen.queryByText(/最近的考试压力/)).not.toBeInTheDocument()
    })

    it('焦点还原: 关闭后焦点回到打开前的触发元素', async () =>
    {
        render(<ConfirmHarness />)
        const user = userEvent.setup()
        const trigger = screen.getByRole('button', { name: '触发入口' })
        await user.click(trigger)
        expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()//* 开: 焦点移交取消钮
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
        expect(trigger).toHaveFocus()//* 关: 焦点还原给触发元素
    })

    it('层级阶梯: .confirm-modal z-index 90 (压过菜单 86), RED 预警 100 仍在其上', () =>
    {
        const confirmRule = BASE_CSS.match(/\.confirm-modal\s*{[^}]*}/)![0]
        const menuRule = BASE_CSS.match(/\.user-menu\s*{[^}]*}/)![0]
        const redRule = BASE_CSS.match(/\.red-alert-overlay\s*{[^}]*}/)![0]
        const confirmZ = Number(confirmRule.match(/z-index:\s*(\d+)/)![1])
        const menuZ = Number(menuRule.match(/z-index:\s*(\d+)/)![1])
        const redZ = Number(redRule.match(/z-index:\s*(\d+)/)![1])
        expect(confirmZ).toBe(90)
        expect(confirmZ).toBeGreaterThan(menuZ)
        expect(confirmZ).toBeLessThan(redZ)
    })
})
