//* useChatSend 登出复位回归测试: 未绑定窗口 (meta 未达/新会话降级全程, sessionIdRef 均为 null) 下
//* 登出必须无条件清屏 — 心理健康数据红线. 流式以挂起 Promise 模拟在途, 不解析 SSE (规避脆弱流 mock);
//* 驱动方式为纯 UI 点击 + DOM 断言 (无模块级探针突变, 对 React 编译器/lint 友好).
//* Task 13 增补: 记一笔 RED 兜底回归 — createDiary 命中 RED 必须改走危机域 showRed, 不落 success toast.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { AuthProvider } from '../context/AuthContext'
import { AlertContext } from '../context/AlertContext'
import { useAuth } from './useAuth'
import { useChatSend } from './useChatSend'

//* streamMessage 挂起: 模拟"meta 未达的在途窗口"; 其余端点在本用例中不会被触达, 一并桩住防误发.
vi.mock('../api/chat', () => ({
    streamMessage: vi.fn(() => new Promise<void>(() => {})),
    sendMessage: vi.fn(() => new Promise(() => {})),
    listMessages: vi.fn(() => Promise.resolve([])),
    listSessions: vi.fn(() => Promise.resolve([])),
    deleteSession: vi.fn(() => Promise.resolve()),
}))
vi.mock('../api/diary', () => ({ createDiary: vi.fn() }))
vi.mock('../utils/toast', () => ({ toast: vi.fn(), ToastHost: () => null }))

import { createDiary } from '../api/diary'
import { toast } from '../utils/toast'
import type { DiaryItem } from '../types'

const USER = { token: 't', userId: 'u1', username: 'n', role: 'STUDENT' } as const

const showRed = vi.fn()
const dismissRed = vi.fn()

function Harness(): ReactElement
{
    const { user, login, logout } = useAuth()
    const { messages, streaming, handleSend } = useChatSend({ sessions: null, openRequest: null, reloadSessions: () => {} })
    return (
        <div>
            <span data-testid="state">{user == null ? 'guest' : 'authed'}/{messages.length}/{String(streaming)}</span>
            <button type="button" onClick={() => login(USER)}>login</button>
            <button type="button" onClick={logout}>logout</button>
            <button type="button" onClick={() => handleSend('最近的考试压力', 'chat')}>send</button>
            <button type="button" onClick={() => handleSend('今天有点撑不住', 'diary')}>diary</button>
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
})

describe('useChatSend (记一笔 RED 兜底)', () =>
{
    const RED_DIARY: DiaryItem = {
        id: 1, userId: 'u1', content: '今天有点撑不住', audioUrl: null,
        analysisResult: { positive: 0.1, negative: 0.9, anxiety: 0.8, weather: 'STORM', warningLevel: 'RED', summary: '你提到了很沉重的感受' },
        createdAt: '2026-09-29T00:00:00Z',
    }
    const CALM_DIARY: DiaryItem = { ...RED_DIARY, analysisResult: { ...RED_DIARY.analysisResult!, warningLevel: 'GREEN', summary: '一切安好' } }

    it('warningLevel=RED: createDiary 成功后改走危机域 showRed, 不落 success toast', async () =>
    {
        vi.mocked(createDiary).mockResolvedValue(RED_DIARY)
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login' }))
        await u.click(screen.getByRole('button', { name: 'diary' }))
        expect(createDiary).toHaveBeenCalledWith({ content: '今天有点撑不住' })
        expect(showRed).toHaveBeenCalledTimes(1)
        expect(showRed).toHaveBeenCalledWith(expect.objectContaining({ type: 'RED_ALERT', reason: '你提到了很沉重的感受' }))
        expect(toast).not.toHaveBeenCalledWith('记好了, 我会好好收藏.', 'success')
    })

    it('普通日记: 不触发预警, 照常 success toast', async () =>
    {
        vi.mocked(createDiary).mockResolvedValue(CALM_DIARY)
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login' }))
        await u.click(screen.getByRole('button', { name: 'diary' }))
        expect(showRed).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledWith('记好了, 我会好好收藏.', 'success')
    })
})
