//* Composer 测试 (homepage-v2 Task 9 重构): 文本发送/换行/IME 防误发 + chips 插槽注入 (D25) + 自动增高 + 语音钮在位.
//* 分层裁决 (D16 记一笔移除后): 访客门不在此层收口文本发送 — onSend 无条件上抛, 门活在 useChatSend 接线处
//* (requireAuth 包 doSend, 见 [[ChatView.test]]); chips 是例外: 访客 (onRequireLogin 在场) 点击只上抛开门且不直发.
//* 语音链路依赖 MediaRecorder/AudioContext, jsdom 不具备, 仅断言按钮在位.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Composer, { PLACEHOLDER_CHAT } from './Composer'
import { growTextarea } from '../../utils/autogrow'
import type { IHomeChip } from '../../extensions/types'

//* 自动增高接线观测: 包一层 spy 保留原实现 (jsdom 无布局, 像素行为由 [[autogrow.test]] 桩测钉死).
vi.mock('../../utils/autogrow', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('../../utils/autogrow')>()
    return { ...actual, growTextarea: vi.fn(actual.growTextarea) }
})

const CHIPS: IHomeChip[] = [
    { label: '聊聊心情', question: '和我聊聊今天的心情' },
    { label: '压力有点大', question: '我最近压力有点大' },
]

function renderComposer(onSend = vi.fn(), opts: { disabled?: boolean; chips?: IHomeChip[]; onRequireLogin?: () => void } = {}): void
{
    render(<Composer onSend={onSend} disabled={opts.disabled} chips={opts.chips ?? CHIPS} onRequireLogin={opts.onRequireLogin} />)
}

describe('Composer (输入区)', () =>
{
    it('Enter 发送并清空, Shift+Enter 换行不发送, 纯空白不发送', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend)
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        await user.type(box, '最近的考试压力有点大{Enter}')
        expect(onSend).toHaveBeenCalledOnce()
        expect(onSend).toHaveBeenCalledWith('最近的考试压力有点大')
        expect(box.value).toBe('')
        await user.type(box, '   {Enter}')
        expect(onSend).toHaveBeenCalledOnce()  //! 纯空白消息不发出, 也不清空输入.
        expect(box.value).toBe('   ')
        await user.type(box, '{Shift>}{Enter}{/Shift}第二行')
        expect(box.value).toBe('   \n第二行')
        expect(onSend).toHaveBeenCalledOnce()  //* Shift+Enter 落换行, 不触发发送.
    })

    it('IME 防误发: 输入法合成期回车 (isComposing / keyCode 229) 不触发发送', () =>
    {
        const onSend = vi.fn()
        renderComposer(onSend)
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        fireEvent.change(box, { target: { value: 'nihao' } })
        fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
        fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 })  //* 部分 IME 上报的合成过程键码.
        expect(onSend).not.toHaveBeenCalled()
    })

    it('chips 插槽: 按注入顺序渲染 label, 点击直发 question (登录态无 onRequireLogin)', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend)
        expect(screen.getByRole('button', { name: '聊聊心情' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '压力有点大' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '压力有点大' }))
        expect(onSend).toHaveBeenCalledOnce()
        expect(onSend).toHaveBeenCalledWith('我最近压力有点大')  //* 直发完整问题, 与输入框内容无关.
    })

    it('chips 访客门: onRequireLogin 在场时点击只上抛开门, 不直发', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        const onRequireLogin = vi.fn()
        renderComposer(onSend, { onRequireLogin })
        await user.click(screen.getByRole('button', { name: '聊聊心情' }))
        expect(onRequireLogin).toHaveBeenCalledOnce()
        expect(onSend).not.toHaveBeenCalled()  //! 访客 chips 不进发送管线 (直发只属于登录态).
    })

    it('空 chips 插槽: 不渲染任何 chip 按钮', () =>
    {
        renderComposer(vi.fn(), { chips: [] })
        expect(document.querySelector('.composer-chip')).not.toBeInTheDocument()
    })

    it('自动增高 (评审整改): 高度改由 growTextarea 像素级驱动, rows 恒 1; 清空后同样触发收敛', () =>
    {
        //* jsdom 无布局 (scrollHeight 恒 0), 像素行为由 [[autogrow.test]] 的桩测钉死; 此处钉接线契约:
        //* 每次 text 变化 (含清空) 都必须调用 growTextarea, rows 属性不再是增高机制.
        const growSpy = vi.mocked(growTextarea)
        growSpy.mockClear()
        renderComposer()
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        expect(box).toHaveAttribute('rows', '1')
        expect(growSpy).toHaveBeenCalledOnce()  //* mount 即触发一次: 初始高度对齐 CSS 基线.
        fireEvent.change(box, { target: { value: '第一行\n第二行' } })
        expect(box).toHaveAttribute('rows', '1')
        expect(growSpy).toHaveBeenCalledWith(box)
        fireEvent.change(box, { target: { value: '' } })
        expect(growSpy).toHaveBeenCalledTimes(3)  //* mount + 输入 + 清空: 清空同样触发收缩回弹.
    })

    it('语音按钮在位, 聊天占位语不变 (录音链路依赖浏览器 API, jsdom 仅验存在)', () =>
    {
        renderComposer()
        expect(screen.getByRole('button', { name: '语音输入' })).toBeInTheDocument()
        expect(screen.getByPlaceholderText(PLACEHOLDER_CHAT)).toBeInTheDocument()
    })

    it('disabled: 发送按钮/chips/语音钮停用, Enter 不触发发送', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend, { disabled: true })
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        expect(box).toBeDisabled()
        expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
        expect(screen.getByRole('button', { name: '聊聊心情' })).toBeDisabled()
        await user.type(box, '不该发出去{Enter}')
        expect(onSend).not.toHaveBeenCalled()
    })
})
