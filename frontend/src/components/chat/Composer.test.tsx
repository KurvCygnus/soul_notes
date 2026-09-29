//* Composer 测试: 文本发送/换行/IME 防误发 + chips 预置发送 + 记一笔双态与自动复位 + 自动增高.
//* 层次裁决: 访客门拦截不在此层 — Composer 无条件上抛 onSend, 门活在 ChatView/useChatSend 接线处
//* (见 [[ChatView.test]] 的访客用例). 语音链路依赖 MediaRecorder/AudioContext, jsdom 不具备, 仅断言按钮在位.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Composer, { PLACEHOLDER_CHAT, PLACEHOLDER_DIARY } from './Composer'

function renderComposer(onSend = vi.fn(), disabled = false): void
{
    render(<Composer onSend={onSend} disabled={disabled} />)
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
        expect(onSend).toHaveBeenCalledWith('最近的考试压力有点大', 'chat')
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

    it('chips: 本周安排/心情天气 直接以聊天模式发送预置文案', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend)
        await user.click(screen.getByRole('button', { name: /本周安排/ }))
        expect(onSend).toHaveBeenLastCalledWith('帮我看看这周的课和考试安排', 'chat')
        await user.click(screen.getByRole('button', { name: /心情天气/ }))
        expect(onSend).toHaveBeenLastCalledWith('我最近的心情天气怎么样?', 'chat')
    })

    it('记一笔: 切换琥珀态与占位语, 提交后自动复位聊天模式', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend)
        const chip = screen.getByRole('button', { name: /记一笔/ })
        expect(chip).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByPlaceholderText(PLACEHOLDER_CHAT)).toBeInTheDocument()
        await user.click(chip)
        expect(chip).toHaveAttribute('aria-pressed', 'true')  //* 琥珀高亮由 aria-pressed 驱动样式.
        expect(screen.getByPlaceholderText(PLACEHOLDER_DIARY)).toBeInTheDocument()
        await user.type(screen.getByPlaceholderText(PLACEHOLDER_DIARY), '今天有点丧{Enter}')
        expect(onSend).toHaveBeenCalledWith('今天有点丧', 'diary')
        //* 提交后自动复位: 防止下一条闲聊消息误落日记.
        expect(screen.getByRole('button', { name: /记一笔/ })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByPlaceholderText(PLACEHOLDER_CHAT)).toBeInTheDocument()
    })

    it('自动增高: 行数随内容增长并封顶, 空输入收敛回单行', () =>
    {
        renderComposer()
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        expect(box).toHaveAttribute('rows', '1')
        fireEvent.change(box, { target: { value: '第一行\n第二行' } })
        expect(box).toHaveAttribute('rows', '2')
        fireEvent.change(box, { target: { value: '1\n2\n3\n4\n5\n6' } })
        expect(box).toHaveAttribute('rows', '4')  //* 上限 4 行, 更长内容交给滚动.
        fireEvent.change(box, { target: { value: '' } })
        expect(box).toHaveAttribute('rows', '1')
    })

    it('语音按钮在位 (录音链路依赖浏览器 API, jsdom 仅验存在)', () =>
    {
        renderComposer()
        expect(screen.getByRole('button', { name: '语音输入' })).toBeInTheDocument()
    })

    it('disabled: 发送按钮/chips/语音钮停用, Enter 不触发发送', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend, true)
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        expect(box).toBeDisabled()
        expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
        await user.type(box, '不该发出去{Enter}')
        expect(onSend).not.toHaveBeenCalled()
    })
})
