//* ChatView 接线测试: Composer 上抛 (text, mode) 后聊天/日记两条路径的行为分叉, 以及访客门在接线点的生效.
//* 层次裁决: 简报中的"访客发送触发 requireAuth"断言落在 ChatView 层 — Composer 无条件上抛, 门拦截真正
//* 发生的位置在 useChatSend.handleSend 经 gate.requireAuth 包装 (状态机本体另有 [[useChatGate.test]]).
//* 用 <Outlet context> 模拟壳层下发 (不引 AppShell/LoginSheet, 避免把浮层测试耦合进接线断言).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { AUTH_KEY } from '../api/auth'
import { TOKEN_KEY } from '../api/http'
import { createDiary, uploadVoice } from '../api/diary'
import { AuthProvider } from '../context/AuthContext'
import { useChatGate } from '../hooks/useChatGate'
import { ToastHost } from '../utils/toast'
import ChatView from './ChatView'
import { PLACEHOLDER_CHAT } from '../components/chat/Composer'
import type { IChatViewContext } from './chatContext'
import type { AuthData } from '../types'

vi.mock('../api/diary', () => ({
    createDiary: vi.fn(() => Promise.resolve(
        { id: 1, userId: 'u1', content: null, audioUrl: null, analysisResult: null, createdAt: '2026-09-28T10:00:00' })),
    uploadVoice: vi.fn(),  //* Composer 有静态 import, mock 必须给全命名导出 (本文件不触发语音链路).
}))

const AUTHED: AuthData = { token: 't', userId: 'u1', username: 'n', role: 'STUDENT' }

const CTX: IChatViewContext = { sessions: null, reloadSessions: () => {}, openRequest: null }

//* 门状态探针: gate.open 渲染出来供断言 (ChatView 不渲染 LoginSheet, 那是壳层的职责).
function GateProbe(): ReactElement
{
    const gate = useChatGate()
    return <span data-testid="gate-open">{String(gate.open)}</span>
}

function renderChat(): void
{
    render(
        <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/" element={<Outlet context={CTX} />}>
                        <Route index element={<ChatView />} />
                    </Route>
                </Routes>
            </MemoryRouter>
            <GateProbe />
            <ToastHost />
        </AuthProvider>,
    )
}

describe('ChatView (输入区接线)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.mocked(createDiary).mockClear()
        vi.mocked(uploadVoice).mockClear()
    })

    it('访客聊天发送: 门拦截翻开门态且不产生消息 (接线点生效), 输入已清空等待登录后补发', async () =>
    {
        const user = userEvent.setup()
        renderChat()
        const box = screen.getByRole('textbox')
        await user.type(box, '最近有点睡不着{Enter}')
        expect(screen.getByTestId('gate-open')).toHaveTextContent('true')
        expect(screen.queryByText('最近有点睡不着')).not.toBeInTheDocument()  //* pending 未执行, 无乐观气泡.
        expect(box).toHaveValue('')
    })

    it('已登录记一笔: createDiary 收到内容并提示成功, 模式自动复位回聊天', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const user = userEvent.setup()
        renderChat()
        await user.click(screen.getByRole('button', { name: /记一笔/ }))
        await user.type(screen.getByPlaceholderText(/记一笔/), '今天有点丧{Enter}')
        await screen.findByText('记好了, 我会好好收藏.')
        expect(vi.mocked(createDiary)).toHaveBeenCalledOnce()
        expect(vi.mocked(createDiary)).toHaveBeenCalledWith({ content: '今天有点丧' })
        //* Task 13 的 RED 预警检查点在 useChatSend#submitDiary 的 then 内, 此处只验证成功路径通到 toast.
        expect(screen.getByPlaceholderText(PLACEHOLDER_CHAT)).toBeInTheDocument()  //* 已复位回聊天占位语.
        expect(screen.getByRole('button', { name: /记一笔/ })).toHaveAttribute('aria-pressed', 'false')
    })
})
