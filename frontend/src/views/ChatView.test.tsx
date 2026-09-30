//* ChatView 接线测试 (homepage-v2 Task 9 重构): Composer 上抛 text 后的访客门接线 (requireAuth 包 doSend),
//* chips 插槽的登录直发/访客开门分叉, 以及情境卡唤起通道 (sendRequest → handleSend, nonce 判重防重放).
//* 层次裁决: 门状态机本体另有 [[useChatGate.test]], chips 上限策略另有 [[homeChips.test]] —
//* 此处只验接线与分叉. 用 <Outlet context> 模拟壳层下发 (不引 AppShell/LoginSheet, 避免浮层测试耦合进接线断言).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { AUTH_KEY } from '../api/auth'
import { TOKEN_KEY } from '../api/http'
import { uploadVoice } from '../api/diary'
import { streamMessage } from '../api/chat'
import { AuthProvider } from '../context/AuthContext'
import { AlertContext } from '../context/AlertContext'
import { useChatGate } from '../hooks/useChatGate'
import { ToastHost } from '../utils/toast'
import ChatView from './ChatView'
import type { IStreamOptions } from '../api/chat'
import type { IChatViewContext } from './chatContext'
import type { AuthData } from '../types'

vi.mock('../api/diary', () => ({
    uploadVoice: vi.fn(),  //* Composer 有静态 import, mock 必须给全命名导出 (本文件不触发语音链路).
}))

vi.mock('../api/chat', () => ({
    //* 流式桩: 同步回放 meta + 两个增量 token 后即成功 — 通道测试只关心管线是否被正确唤醒, 不测流协议本体.
    streamMessage: vi.fn((opts: IStreamOptions) => { opts.onMeta('s9'); opts.onChunk('我在听.'); return Promise.resolve() }),
    sendMessage: vi.fn(),  //* useChatSend 静态 import, mock 必须给全命名导出 (降级路径本文件不触发).
    listMessages: vi.fn(),
}))

const AUTHED: AuthData = { token: 't', userId: 'u1', username: 'n', role: 'STUDENT' }

const CTX: IChatViewContext = { sessions: null, reloadSessions: () => {}, openRequest: null, sendRequest: null }

//* 登录态下 ChatView 会挂 DailySummaryLine (composer 随行): 全局 fetch 桩成成功空壳, 钩子自行降级隐藏.
//* 每次调用给全新 Response 实例 (体一次性, 共享单例会让后续消费者全部拒绝 — 桩语义是"每个请求独立成功").
function stubSuccessFetch(): void
{
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ code: 0, message: 'ok', data: [] }), { status: 200 })))
}

//* 门状态探针: gate.open 渲染出来供断言 (ChatView 不渲染 LoginSheet, 那是壳层的职责).
function GateProbe(): ReactElement
{
    const gate = useChatGate()
    return <span data-testid="gate-open">{String(gate.open)}</span>
}

function chatTree(ctx: IChatViewContext): ReactElement
{
    return (
        <AuthProvider>
            {/* AlertContext 直注空壳 (Task 13 起 useChatSend 读 useAlert): 本文件不涉预警链路,
                不挂真 AlertProvider 以免误开 WS 生命周期; 其行为另有 [[AlertContext.test]] 覆盖. */}
            <AlertContext.Provider value={{ red: null, showRed: () => {}, dismissRed: () => {} }}>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route path="/" element={<Outlet context={ctx} />}>
                            <Route index element={<ChatView />} />
                        </Route>
                    </Routes>
                </MemoryRouter>
                <GateProbe />
                <ToastHost />
            </AlertContext.Provider>
        </AuthProvider>
    )
}

function renderChat(ctx: IChatViewContext = CTX)
{
    return render(chatTree(ctx))
}

describe('ChatView (输入区接线)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.mocked(uploadVoice).mockClear()
        vi.mocked(streamMessage).mockClear()
        stubSuccessFetch()
    })

    afterEach(() =>
    {
        vi.unstubAllGlobals()
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

    it('chips 插槽 (D25): 注册表零贡献时三条内置文案在场, 供访客与登录态共用', async () =>
    {
        renderChat()
        for(const label of ['和我聊聊今天的心情', '我最近压力有点大', '帮我想想怎么放松'])
            expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    })

    it('chips 访客门: 点击只翻开门态且不直发 (D25 上抛不直发)', async () =>
    {
        const user = userEvent.setup()
        renderChat()
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(screen.getByTestId('gate-open')).toHaveTextContent('true')
        expect(vi.mocked(streamMessage)).not.toHaveBeenCalled()  //! 访客 chips 不进发送管线.
        expect(document.querySelector('.bubble-user')).not.toBeInTheDocument()  //* 无乐观气泡 (不直发).
    })

    it('chips 登录直发: 点击 chip 以完整问题进入发送管线 (与手输同路)', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const user = userEvent.setup()
        renderChat()
        await user.click(screen.getByRole('button', { name: '帮我想想怎么放松' }))
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        expect(vi.mocked(streamMessage)).toHaveBeenCalledWith(expect.objectContaining({ content: '帮我想想怎么放松' }))
    })

    it('情境卡唤起通道 (Task 12): sendRequest 以聊天模式进入发送管线, nonce 判重防壳层重放', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const utils = renderChat({ ...CTX, sendRequest: { content: '帮我看看今天的课', nonce: 1 } })
        await screen.findByText('帮我看看今天的课')  //* 用户气泡 (乐观追加) — 请求已进管线.
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        expect(vi.mocked(streamMessage)).toHaveBeenCalledWith(expect.objectContaining({ content: '帮我看看今天的课' }))
        //* 壳层重渲染可能以新对象下发同一 nonce: 判重后不得重复发送 (即使 handleSend 身份随 ctx 变化).
        utils.rerender(chatTree({ ...CTX, sendRequest: { content: '帮我看看今天的课', nonce: 1 } }))
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        //* nonce 前进 → 新请求放行, 内容随之更新.
        utils.rerender(chatTree({ ...CTX, sendRequest: { content: '快要考试了, 帮我梳理一下复习节奏', nonce: 2 } }))
        await screen.findByText('快要考试了, 帮我梳理一下复习节奏')
        expect(vi.mocked(streamMessage)).toHaveBeenCalledTimes(2)
    })

    it('重挂载不重发 (评审修复回归): unmount→remount 同 nonce 不重发, 新 nonce 放行', async () =>
    {
        //* 消费台账为模块级且跨用例存活 (同文件内模块只加载一次): 本文件所有用例的 nonce 必须单调递增 (上例已消费 1/2).
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const utils = renderChat({ ...CTX, sendRequest: { content: '重挂载前的提问', nonce: 3 } })
        await screen.findByText('重挂载前的提问')
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        utils.unmount()
        //* 同 nonce 重挂载 (情境卡点击后去 /crisis 再返回): 台账已记账 → 不重发.
        //* 修前台账是 mount-scoped ref, 重挂后归零把已消费 nonce 当新请求重放 (重复消息 + 二次 LLM 调用).
        const remounted = renderChat({ ...CTX, sendRequest: { content: '重挂载前的提问', nonce: 3 } })
        await screen.findByText('你好, 今天想聊点什么?')  //* remount 落定 (空消息回到 hero).
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        //* 新 nonce (卡片再次点击) → 照常放行.
        remounted.rerender(chatTree({ ...CTX, sendRequest: { content: '重挂载后的新提问', nonce: 4 } }))
        await screen.findByText('重挂载后的新提问')
        expect(vi.mocked(streamMessage)).toHaveBeenCalledTimes(2)
    })
})
