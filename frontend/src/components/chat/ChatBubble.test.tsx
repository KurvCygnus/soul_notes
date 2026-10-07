//* 聊天消息测试 (Task 3 AI 无气泡形态): AI 侧 = 元信息行 + kv-chat-md Markdown 容器, 用户侧保持气泡.
//* 剪贴板桩经 Object.defineProperty 挂 navigator.clipboard (jsdom 无此 API), afterEach 删除防跨用例泄漏;
//* toast 走模块级全局 store: 同文件先前的条目仍会在屏, 断言一律用"计数增长"口径而非单点存在性.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ChatBubble from './ChatBubble'
import { ToastHost } from '../../utils/toast'
import { MD_SCOPE_CLASS } from '../../utils/markdown/md-render'
import type { IDisplayMessage } from '../../utils/group'

//* 固定 ts (无时区后缀 → 按本地时区解析, 断言跨机器稳定): 小时/分钟均需补零以钉住 HH:mm 口径.
const AI_MSG: IDisplayMessage = { role: 'assistant', content: '我在听, 慢慢说.', ts: '2026-10-05T09:05:00' }
const AI_STREAMING_MSG: IDisplayMessage = { role: 'assistant', content: '我在听, 慢慢说.', ts: null }
const USER_MSG: IDisplayMessage = { role: 'user', content: '我最近压力有点大', ts: null }

function renderBubble(message: IDisplayMessage, streaming = false, thinkingLabel: string | null = null): ReturnType<typeof render>
{
    return render(
        <MemoryRouter>
            <ChatBubble message={message} streaming={streaming} thinkingLabel={thinkingLabel ?? undefined} />
            <ToastHost />
        </MemoryRouter>,
    )
}

function stubClipboard(writeText: () => Promise<void>): ReturnType<typeof vi.fn>
{
    const mock = vi.fn(writeText)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: mock }, configurable: true })
    return mock
}

//* toast 计数增长断言: 记录点击前同文案条目数, 动作后必须恰好 +1 (全局 store 跨用例残留也不误判).
async function expectToastGrows(text: string, action: () => Promise<void>): Promise<void>
{
    const before = screen.queryAllByText(text).length
    await action()
    expect(await screen.findAllByText(text)).toHaveLength(before + 1)
}

describe('ChatBubble (聊天消息)', () =>
{
    afterEach(() =>
    {
        cleanup()
        delete (navigator as unknown as { clipboard?: unknown }).clipboard  //* 剪贴板桩可配置属性, 用例间删除归还.
        vi.restoreAllMocks()
    })

    it('AI 历史回复渲染为元信息行 + kv-chat-md 容器, 不再有 .bubble 气泡类', () =>
    {
        const { container } = renderBubble(AI_MSG)
        const root = container.querySelector('.msg-ai')
        expect(root).not.toBeNull()
        expect(root?.querySelector('.msg-meta')).not.toBeNull()
        expect(root?.querySelector(`.${MD_SCOPE_CLASS}`)).not.toBeNull()
        expect(root?.querySelector(`.${MD_SCOPE_CLASS}`)?.textContent).toContain('我在听, 慢慢说.')
        expect(container.querySelector('.bubble')).toBeNull()
    })

    it('Markdown 标题在容器内渲染为 heading 元素', () =>
    {
        const { container } = renderBubble({ role: 'assistant', content: '## 小节\n正文', ts: null })
        const heading = container.querySelector(`.${MD_SCOPE_CLASS} h2, .${MD_SCOPE_CLASS} h3, .${MD_SCOPE_CLASS} h4, .${MD_SCOPE_CLASS} h5, .${MD_SCOPE_CLASS} h6`)
        expect(heading).not.toBeNull()
        expect(heading?.textContent).toContain('小节')
    })

    it('复制钮在元信息行内且流式中隐藏', () =>
    {
        renderBubble(AI_MSG)
        const btn = screen.getByRole('button', { name: '复制回复' })
        expect(btn.closest('.msg-meta')).not.toBeNull()
        cleanup()
        renderBubble(AI_STREAMING_MSG, true)
        expect(screen.queryByRole('button', { name: '复制回复' })).not.toBeInTheDocument()
    })

    it('用户消息保持气泡形态与右对齐类, 不加复制钮', () =>
    {
        const { container } = renderBubble(USER_MSG)
        expect(container.querySelector('.bubble-row-user')).not.toBeNull()
        expect(container.querySelector('.bubble-user')).not.toBeNull()
        expect(container.querySelector('.msg-ai')).toBeNull()
        expect(screen.getByText('我最近压力有点大')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '复制回复' })).not.toBeInTheDocument()
    })

    it('AI 回复时间以 HH:mm 显示', () =>
    {
        const { container } = renderBubble(AI_MSG)
        const time = container.querySelector('.msg-ai time')
        expect(time).not.toBeNull()
        expect(time?.textContent).toBe('09:05')
        cleanup()
        //* 流式乐观消息无时间 (ts 为 null): 时间元素整颗跳过, 不留空位.
        const { container: streamingContainer } = renderBubble(AI_STREAMING_MSG, true)
        expect(streamingContainer.querySelector('.msg-ai time')).toBeNull()
    })

    it('点击复制: navigator.clipboard.writeText 收到该条消息全文, 成功后 toast 已复制', async () =>
    {
        const user = userEvent.setup()
        const writeText = stubClipboard(() => Promise.resolve())
        renderBubble(AI_MSG)
        await expectToastGrows('已复制', () => user.click(screen.getByRole('button', { name: '复制回复' })))
        expect(writeText).toHaveBeenCalledExactlyOnceWith(AI_MSG.content)
    })

    it('写入被拒 (权限拒绝等): toast 复制失败, 不误报成功', async () =>
    {
        const user = userEvent.setup()
        stubClipboard(() => Promise.reject(new Error('denied')))
        renderBubble(AI_MSG)
        const successBefore = screen.queryAllByText('已复制').length  //* 全局 store 跨用例残留: 本次点击不得新增成功条目.
        await expectToastGrows('复制失败', () => user.click(screen.getByRole('button', { name: '复制回复' })))
        expect(screen.queryAllByText('已复制')).toHaveLength(successBefore)
    })

    it('剪贴板 API 缺席 (非安全上下文): 点击不抛错, toast 复制失败兜底', async () =>
    {
        renderBubble(AI_MSG)  //* 不装桩; 也不走 userEvent — user-event 的 setup 会自带一枚恒成功的剪贴板桩, 恰好掩盖缺席形态.
        await expectToastGrows('复制失败', async () =>
        {
            fireEvent.click(screen.getByRole('button', { name: '复制回复' }))
        })
    })

    //region 流式分片通道 (Task 4): 纯文本分片 chunk-in span 序列 + 尾随 caret-bar, 流式期不走 kv-chat-md
    it('流式分片渲染: 正文为 .chunk-in span 且尾随 .caret-bar, 流式期不渲染 kv-chat-md 容器', () =>
    {
        const { container } = renderBubble(AI_STREAMING_MSG, true)
        const chunk = container.querySelector('.chunk-in')
        expect(chunk).not.toBeNull()
        expect(chunk?.textContent).toBe('我在听, 慢慢说.')
        expect(container.querySelector('.caret-bar')).not.toBeNull()
        expect(container.querySelector(`.${MD_SCOPE_CLASS}`)).toBeNull()  //* 流式期不走 md 渲染 (无双重渲染).
    })

    it('分片台账: 增量到达以新 span 追加, 已到分片文本与身份不重排', () =>
    {
        const utils = render(
            <MemoryRouter>
                <ChatBubble message={{ role: 'assistant', content: '你好', ts: null }} streaming />
            </MemoryRouter>,
        )
        const spans = (): NodeListOf<Element> => utils.container.querySelectorAll('.chunk-in')
        expect(spans()).toHaveLength(1)
        utils.rerender(
            <MemoryRouter>
                <ChatBubble message={{ role: 'assistant', content: '你好, 我在听', ts: null }} streaming />
            </MemoryRouter>,
        )
        expect(spans()).toHaveLength(2)  //* 相邻两次渲染的长度差为一片, 既有 span 身份稳定 (不重放入场动效).
        expect(spans()[0].textContent).toBe('你好')
        expect(spans()[1].textContent).toBe(', 我在听')
        expect(utils.container.querySelector('.caret-bar')).not.toBeNull()
    })

    it('流式等待窗口 (分片为空): 无 chunk-in 无 caret-bar, 等待视觉交给 ChatView 思考行', () =>
    {
        const { container } = renderBubble({ role: 'assistant', content: '', ts: null }, true)
        expect(container.querySelector('.chunk-in')).toBeNull()
        expect(container.querySelector('.caret-bar')).toBeNull()
    })

    it('流式等待窗口: 工具调用 label 替换思考指示文本, 事件缺失回落 "思考中" (工具调用可见性)', () =>
    {
        const withLabel = renderBubble({ role: 'assistant', content: '', ts: null }, true, '正在查询课表…')
        expect(withLabel.container.querySelector('.msg-thinking')).not.toBeNull()
        expect(withLabel.container.querySelector('.shimmer-text')?.textContent).toBe('正在查询课表…')
        cleanup()
        const fallback = renderBubble({ role: 'assistant', content: '', ts: null }, true)
        expect(fallback.container.querySelector('.shimmer-text')?.textContent).toBe('思考中')
        cleanup()
        //* 分片到达 (工具结果回灌后恢复流式): 思考指示整体退场, label 不再渲染.
        const streaming = renderBubble(AI_STREAMING_MSG, true, '正在查询课表…')
        expect(streaming.container.querySelector('.msg-thinking')).toBeNull()
    })

    it('流结束: caret-bar 与分片 span 移除, 正文转 kv-chat-md 渲染', () =>
    {
        const utils = renderBubble(AI_STREAMING_MSG, true)
        utils.rerender(
            <MemoryRouter>
                <ChatBubble message={AI_MSG} streaming={false} />
            </MemoryRouter>,
        )
        expect(utils.container.querySelector('.caret-bar')).toBeNull()
        expect(utils.container.querySelector('.chunk-in')).toBeNull()
        expect(utils.container.querySelector(`.${MD_SCOPE_CLASS}`)?.textContent).toContain('我在听, 慢慢说.')
    })

    it('模拟光标退役: 流式 DOM 无 .chat-cursor, 文本不含 ▍', () =>
    {
        const { container } = renderBubble(AI_STREAMING_MSG, true)
        expect(container.querySelector('.chat-cursor')).toBeNull()
        expect(container.textContent).not.toContain('▍')
    })
    //endregion
})
