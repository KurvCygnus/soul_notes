//* useChatSend 登出复位回归测试: 未绑定窗口 (meta 未达/新会话降级全程, sessionIdRef 均为 null) 下
//* 登出必须无条件清屏 — 心理健康数据红线. 流式以挂起 Promise 模拟在途, 不解析 SSE (规避脆弱流 mock);
//* 驱动方式为纯 UI 点击 + DOM 断言 (无模块级探针突变, 对 React 编译器/lint 友好).
//* homepage-v2 Task 9: 记一笔移除 (D16) — handleSend 收敛为单一聊天模式, RED 预警链只走 WS 通道
//* (其行为归 [[AlertContext.test]]), 日记域兜底随 submitDiary 一并退场.
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { AuthProvider } from '../context/AuthContext'
import { AlertContext } from '../context/AlertContext'
import { useAuth } from './useAuth'
import { useChatSend } from './useChatSend'
import { streamMessage } from '../api/chat'
import type { IStreamOptions } from '../api/chat'

//* streamMessage 挂起: 模拟"meta 未达的在途窗口"; 其余端点在本用例中不会被触达, 一并桩住防误发.
vi.mock('../api/chat', () => ({
    streamMessage: vi.fn(() => new Promise<void>(() => {})),
    sendMessage: vi.fn(() => new Promise(() => {})),
    listMessages: vi.fn(() => Promise.resolve([])),
    listSessions: vi.fn(() => Promise.resolve([])),
    deleteSession: vi.fn(() => Promise.resolve()),
}))
vi.mock('../utils/toast', () => ({ toast: vi.fn(), ToastHost: () => null }))

const USER = { token: 't', userId: 'u1', username: 'n', role: 'STUDENT' } as const

const showRed = vi.fn()
const dismissRed = vi.fn()

function Harness(): ReactElement
{
    const { user, login, logout } = useAuth()
    const { messages, streaming, handleSend, toolLabel } = useChatSend({ sessions: null, openRequest: null, reloadSessions: () => {} })
    return (
        <div>
            <span data-testid="state">{user == null ? 'guest' : 'authed'}/{messages.length}/{String(streaming)}</span>
            <span data-testid="tool-label">{toolLabel ?? ''}</span>
            <button type="button" onClick={() => login(USER)}>login</button>
            <button type="button" onClick={logout}>logout</button>
            <button type="button" onClick={() => handleSend('最近的考试压力')}>send</button>
            {messages.map((m, i) => <p key={i}>{m.content}</p>)}
        </div>
    )
}

function renderHarness(): void
{
    //* showRed 经上下文直注 (不挂真 AlertProvider): 本文件只验 useChatSend 的接线, WS 生命周期归 AlertContext.test.tsx.
    render(
        <AuthProvider>
            <AlertContext.Provider value={{ red: null, showRed, dismissRed }}>
                <Harness />
            </AlertContext.Provider>
        </AuthProvider>,
    )
}

describe('useChatSend (登出复位回归)', () =>
{
    it('登出未绑定窗口: 乐观消息立即清屏 (sessionIdRef 为 null 亦然)', async () =>
    {
        const u = userEvent.setup()
        renderHarness()
        expect(screen.getByTestId('state')).toHaveTextContent('guest/0/false')
        await u.click(screen.getByRole('button', { name: 'login' }))
        expect(screen.getByTestId('state')).toHaveTextContent('authed/0/false')
        await u.click(screen.getByRole('button', { name: 'send' }))
        expect(screen.getByText('最近的考试压力')).toBeInTheDocument()  //* 乐观气泡在屏 (流在途, meta 未达).
        expect(screen.getByTestId('state')).toHaveTextContent('authed/2/true')
        await u.click(screen.getByRole('button', { name: 'logout' }))
        expect(screen.queryByText('最近的考试压力')).not.toBeInTheDocument()  //* 登出即清屏.
        expect(screen.getByTestId('state')).toHaveTextContent('guest/0/false')
    })

    it('tool-call 过程事件落入 toolLabel 渲染态 (携带扩展自定义 label), 新一轮发送即复位', async () =>
    {
        let captured: IStreamOptions | null = null
        vi.mocked(streamMessage).mockImplementationOnce((opts) => { captured = opts; return new Promise(() => {}) })
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login' }))
        await u.click(screen.getByRole('button', { name: 'send' }))

        expect(screen.getByTestId('tool-label')).toHaveTextContent('')  //* 事件缺失 = 空 (视图回落 "思考中").
        act(() => captured?.onToolCall?.('正在查询课表…'))
        expect(screen.getByTestId('tool-label')).toHaveTextContent('正在查询课表…')

        //* 新一轮发送即复位旧 label: 末条变为本轮新回复, 上一轮的工具过程文案不得残留.
        await u.click(screen.getByRole('button', { name: 'send' }))
        expect(screen.getByTestId('tool-label')).toHaveTextContent('')
    })

    //* RED 回归 (用户实测报告): LLM 回复携带的 <!--soulnotes {...}--> 结构化契约块在后端流式路径
    //* 按"保持原文"emit, 前端不得把该结构化载荷显示到正文 (历史落库文本已由后端拆流, 展示层自守).
    it('流式契约块不外显: Mock-LLM 分片携带 soulnotes JSON 载荷, 界面只显示正文', async () =>
    {
        vi.mocked(streamMessage).mockImplementationOnce(opts =>
        {
            //* 逐字流的最坏形态: 开标记/JSON 载荷/收标记全部拆在不同分片里.
            opts.onChunk('你并不孤单。')
            opts.onChunk('<!--soul')
            opts.onChunk('notes {"tags":["焦虑"],')
            opts.onChunk('"riskLevel":"RED"}')
            opts.onChunk('-->')
            return Promise.resolve()
        })
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login' }))
        await u.click(screen.getByRole('button', { name: 'send' }))
        await screen.findByText('你并不孤单。')  //* 正文在场 (流已收尾).
        expect(screen.queryByText(/soulnotes/)).not.toBeInTheDocument()  //* 契约块标记不可见.
        expect(screen.queryByText(/riskLevel/)).not.toBeInTheDocument()  //* 结构化键不可见.
        expect(screen.queryByText(/焦虑/)).not.toBeInTheDocument()  //* 载荷值不可见.
    })

    //* RED 回归 (C2, 收标记拆流): 收标记 "-->" 被分片切断 ("--" 与 ">" 分属两片) 时旧实现漏判 —
    //* 块永不闭合, 块后正文被整块吞掉 (撑爆放弃上限时还会连同结构化载荷一起外显).
    //* 守卫须在块内跨片扣留收标记尾巴 (至多 3 字符) 拼合再判, 保证块后正文照常上屏.
    it('流式契约块收标记跨片拆开: "--" + ">" 分属两片, 块后正文不丢且载荷不外显', async () =>
    {
        vi.mocked(streamMessage).mockImplementationOnce(opts =>
        {
            opts.onChunk('我在这里陪你。<!--soulnotes {"riskLevel":"RED"}')
            opts.onChunk('--')
            opts.onChunk('>')
            opts.onChunk('慢慢说, 不着急。')
            return Promise.resolve()
        })
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login' }))
        await u.click(screen.getByRole('button', { name: 'send' }))
        await screen.findByText('我在这里陪你。慢慢说, 不着急。')  //* 块已吸收, 块后正文完整在屏.
        expect(screen.queryByText(/soulnotes/)).not.toBeInTheDocument()  //* 契约块标记不可见.
        expect(screen.queryByText(/riskLevel/)).not.toBeInTheDocument()  //* 结构化键不可见.
    })
})
