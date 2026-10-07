//* Composer 测试 (homepage-v2 Task 9 重构): 文本发送/换行/IME 防误发 + chips 插槽注入 (D25) + 自动增高 + 语音钮在位.
//* 分层裁决 (D16 记一笔移除后): 访客门不在此层收口文本发送 — onSend 无条件上抛, 门活在 useChatSend 接线处
//* (requireAuth 包 doSend, 见 [[ChatView.test]]); chips 是例外: 访客 (onRequireLogin 在场) 点击只上抛开门且不直发.
//* 语音链路依赖 MediaRecorder/AudioContext, jsdom 不具备, 仅断言按钮在位.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Composer, { PLACEHOLDER_CHAT } from './Composer'
import { growTextarea } from '../../utils/autogrow'
import { recordAudio } from '../../utils/audio'
import { ToastHost } from '../../utils/toast'
import type { IHomeChip } from '../../extensions/types'

//* 自动增高接线观测: 包一层 spy 保留原实现 (jsdom 无布局, 像素行为由 [[autogrow.test]] 桩测钉死).
vi.mock('../../utils/autogrow', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('../../utils/autogrow')>()
    return { ...actual, growTextarea: vi.fn(actual.growTextarea) }
})

//* 录音链路桩 (Task 15): jsdom 无 MediaRecorder/AudioContext, startVoice 的 getUserMedia 拒绝路径
//* 只能经 recordAudio 桩注入 — 其余导出 (常量/纯函数) 保留原实现.
vi.mock('../../utils/audio', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('../../utils/audio')>()
    return { ...actual, recordAudio: vi.fn() }
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

    //region 高度复位口唯一化 (真机缺陷整改 2026-10-04): 真机实锤 "空值输入框停在大高度" —
    //* 旧实现把重算挂在 [text] 上, 而高度几何跟随 DOM 实况内容; 浏览器表单恢复/IME 合成边缘等
    //* 绕开 React state 的 DOM 写入会让两者脱钩, 此后只要 text 不再变化就永无对账机会.
    it('对账不依赖 text 变化: 无关提交 (流式禁用翻转) 同样触发重算', () =>
    {
        const growSpy = vi.mocked(growTextarea)
        growSpy.mockClear()
        const view = render(<Composer onSend={vi.fn()} chips={[]} />)
        expect(growSpy).toHaveBeenCalledTimes(1)  //* mount 即对账一次 (既有契约).
        view.rerender(<Composer onSend={vi.fn()} chips={[]} disabled={true} />)
        //! 旧实现 [text] 依赖下此处不再调用 — 脱钩场景的复位缺口, 唯一复位口必须每次提交都核账.
        expect(growSpy).toHaveBeenCalledTimes(2)
    })

    it('对账按 DOM 实况收敛 (回归钉: 空值停大高度), 空内容回落基线', () =>
    {
        const growSpy = vi.mocked(growTextarea)
        growSpy.mockClear()
        const view = render(<Composer onSend={vi.fn()} chips={[]} />)
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        Object.defineProperty(box, 'scrollHeight', { value: 86, configurable: true })  //* 桩出 "DOM 实况有大内容" 的现场 (模拟外部写入后的高度滞留).
        view.rerender(<Composer onSend={vi.fn()} chips={[]} disabled={true} />)
        expect(growSpy).toHaveBeenCalledWith(box)
        expect(box.style.height).toBe('86px')  //* 对账后高度跟随实况, 不再滞留旧值.
        Object.defineProperty(box, 'scrollHeight', { value: 0, configurable: true })  //* 内容清空后的实况.
        view.rerender(<Composer onSend={vi.fn()} chips={[]} disabled={false} />)
        expect(box.style.height).toBe('')  //! 空实况交还 CSS 基线 (min-height 单行), 真机缺陷态在此收敛.
    })

    it('切会话草稿回灌: draft 换值驱动按新内容重算 (R3+ 契约在位)', () =>
    {
        const growSpy = vi.mocked(growTextarea)
        growSpy.mockClear()
        const long = '长'.repeat(500)
        const view = render(<Composer onSend={vi.fn()} chips={[]} draft={long} />)
        expect(growSpy).toHaveBeenCalledTimes(1)
        view.rerender(<Composer onSend={vi.fn()} chips={[]} draft="" />)  //* 切到无草稿会话: 回灌空串.
        //* 每次提交都核账 → 回灌涉及两个提交 (回灌前对账 + setText 回灌后对账), 至少新增一账;
        //* 终态断言钉住语义: 高度按回灌后的新值 (jsdom 空实况) 收敛, 不保留上一会话的大高度.
        expect(growSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
        expect(growSpy).toHaveBeenLastCalledWith(screen.getByRole('textbox'))
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('')
    })
    //endregion

    it('语音按钮在位, 聊天占位语不变 (录音链路依赖浏览器 API, jsdom 仅验存在)', () =>
    {
        renderComposer()
        expect(screen.getByRole('button', { name: '语音输入' })).toBeInTheDocument()
        expect(screen.getByPlaceholderText(PLACEHOLDER_CHAT)).toBeInTheDocument()
    })

    it('发送钮 spec (D2/D5/§5.4): 圆形 SVG 上箭头无文字, 语义由 aria-label 承载, 点击直发输入框内容', async () =>
    {
        const user = userEvent.setup()
        const onSend = vi.fn()
        renderComposer(onSend)
        const send = screen.getByRole('button', { name: '发送' })
        expect(send).not.toHaveTextContent('发送')  //* 无文字 (spec §5.4): 可访问名全归 aria-label, 按钮本体只剩图标.
        expect(send.querySelector('svg')).not.toBeNull()  //* SVG-first 纪律: 上箭头经 [[Icon]] 渲染, 非 Unicode 字符.
        expect(send).toHaveClass('composer-send')  //* 圆形底由专用类承担 (base.css 令牌化, 非 btn 家族胶囊形).
        await user.type(screen.getByRole('textbox'), '点按钮也能发')
        await user.click(send)
        expect(onSend).toHaveBeenCalledOnce()
        expect(onSend).toHaveBeenCalledWith('点按钮也能发')
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

    //region 语音错误 toast 文案分流 (Task 15 台账): 按 getUserMedia 拒绝的 name 给对应指引
    it('语音错误分流: NotAllowedError / NotReadableError / 其他 分别给出对应 toast 文案', async () =>
    {
        const user = userEvent.setup()
        render(<><Composer onSend={vi.fn()} chips={[]} /><ToastHost /></>)
        const mic = (): HTMLButtonElement => screen.getByRole('button', { name: '语音输入' }) as HTMLButtonElement

        const denied = new Error('denied')
        denied.name = 'NotAllowedError'
        vi.mocked(recordAudio).mockRejectedValueOnce(denied)
        await user.click(mic())
        expect(await screen.findByText('麦克风权限被拒绝, 请在系统设置中允许')).toBeInTheDocument()

        const busy = new Error('busy')
        busy.name = 'NotReadableError'
        vi.mocked(recordAudio).mockRejectedValueOnce(busy)
        await user.click(mic())  //* 拒绝后 voice 保持 idle, 麦克风钮可再次点击.
        expect(await screen.findByText('麦克风被占用或不可用, 请稍后再试')).toBeInTheDocument()

        vi.mocked(recordAudio).mockRejectedValueOnce(new Error('weird'))
        await user.click(mic())
        expect(await screen.findByText('无法访问麦克风, 请检查浏览器授权.')).toBeInTheDocument()  //* 未知错误保留现文案兜底.
    })
    //endregion
})
