//* ChatView 接线测试 (homepage-v2 Task 9 重构): Composer 上抛 text 后的访客门接线 (requireAuth 包 doSend),
//* chips 插槽的登录直发/访客开门分叉, 以及壳下发的两条 nonce 请求通道 (sendRequest 唤起发送 / newChatRequest
//* 新建会话复位, 均 nonce 判重防重放).
//* 层次裁决: 门状态机本体另有 [[useChatGate.test]], chips 上限策略另有 [[homeChips.test]] —
//* 此处只验接线与分叉. 用 <Outlet context> 模拟壳层下发 (不引 AppShell/LoginSheet, 避免浮层测试耦合进接线断言).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { AUTH_KEY } from '../api/auth'
import { TOKEN_KEY } from '../api/http'
import { uploadVoice } from '../api/voice'
import { listMessages, streamMessage } from '../api/chat'
import { AuthProvider } from '../context/AuthContext'
import { AlertContext } from '../context/AlertContext'
import { useChatGate } from '../hooks/useChatGate'
import { ToastHost } from '../utils/toast'
import ChatView from './ChatView'
import type { IStreamOptions } from '../api/chat'
import type { IChatViewContext } from './chatContext'
import type { AuthData, ChatSessionVo } from '../types'

vi.mock('../api/voice', () => ({
    uploadVoice: vi.fn(),  //* Composer 有静态 import, mock 必须给全命名导出 (本文件不触发语音链路).
}))

vi.mock('../api/chat', () => ({
    //* 流式桩: 同步回放 meta + 两个增量 token 后即成功 — 通道测试只关心管线是否被正确唤醒, 不测流协议本体.
    streamMessage: vi.fn((opts: IStreamOptions) => { opts.onMeta('s9'); opts.onChunk('我在听.'); return Promise.resolve() }),
    sendMessage: vi.fn(),  //* useChatSend 静态 import, mock 必须给全命名导出 (降级路径本文件不触发).
    listMessages: vi.fn(),
}))

const AUTHED: AuthData = { token: 't', userId: 'u1', username: 'n', role: 'STUDENT' }

const CTX: IChatViewContext = { sessions: null, reloadSessions: () => {}, openRequest: null, sendRequest: null, newChatRequest: null }

//* 格言行门禁用例的今日总结内容 (经 [[stubDailySummary]] 下发): 与 DailySummaryLine 自有测试互不耦合.
const DAILY_CONTENT = '今天你留下了温和的自我观察.'

//* 登录态下 ChatView 会挂 DailySummaryLine (composer 随行): 全局 fetch 桩成成功空壳, 钩子自行降级隐藏.
//* 每次调用给全新 Response 实例 (体一次性, 共享单例会让后续消费者全部拒绝 — 桩语义是"每个请求独立成功").
function stubSuccessFetch(): void
{
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ code: 0, message: 'ok', data: [] }), { status: 200 })))
}

//* 格言行在场的桩 (门禁用例专用): daily 端点回可用总结形态, 其余请求回落成功空壳 (api/summary 的
//* 形态守卫把数组视同"无总结"). 只许在格言门禁用例内调用: vi.stubGlobal 后者生效, 会覆盖 beforeEach 的空壳桩.
function stubDailySummary(): void
{
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: unknown) =>
    {
        const data = String(input).includes('/api/v1/summary/daily') ? { date: '2026-10-05', content: DAILY_CONTENT } : []
        return new Response(JSON.stringify({ code: 0, message: 'ok', data }), { status: 200 })
    }))
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
        //* 用户气泡 (乐观追加) — 请求已进管线; selector 钉死气泡: 无标题会话的标题兜底链会以同文渲染 .chat-title.
        await screen.findByText('帮我看看今天的课', { selector: '.bubble-text' })
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        expect(vi.mocked(streamMessage)).toHaveBeenCalledWith(expect.objectContaining({ content: '帮我看看今天的课' }))
        //* 壳层重渲染可能以新对象下发同一 nonce: 判重后不得重复发送 (即使 handleSend 身份随 ctx 变化).
        utils.rerender(chatTree({ ...CTX, sendRequest: { content: '帮我看看今天的课', nonce: 1 } }))
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        //* nonce 前进 → 新请求放行, 内容随之更新.
        utils.rerender(chatTree({ ...CTX, sendRequest: { content: '快要考试了, 帮我梳理一下复习节奏', nonce: 2 } }))
        await screen.findByText('快要考试了, 帮我梳理一下复习节奏', { selector: '.bubble-text' })
        expect(vi.mocked(streamMessage)).toHaveBeenCalledTimes(2)
    })

    it('重挂载不重发 (评审修复回归): unmount→remount 同 nonce 不重发, 新 nonce 放行', async () =>
    {
        //* 消费台账为模块级且跨用例存活 (同文件内模块只加载一次): 本文件所有用例的 nonce 必须单调递增 (上例已消费 1/2).
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const utils = renderChat({ ...CTX, sendRequest: { content: '重挂载前的提问', nonce: 3 } })
        //* selector 钉死气泡: 无标题会话的标题兜底链会以同文渲染 .chat-title (上例同款).
        await screen.findByText('重挂载前的提问', { selector: '.bubble-text' })
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        utils.unmount()
        //* 同 nonce 重挂载 (壳路由切换整体卸载 → 回聊天位): 台账已记账 → 不重发.
        //* 修前台账是 mount-scoped ref, 重挂后归零把已消费 nonce 当新请求重放 (重复消息 + 二次 LLM 调用).
        const remounted = renderChat({ ...CTX, sendRequest: { content: '重挂载前的提问', nonce: 3 } })
        await screen.findByText('你好, 今天想聊点什么?')  //* remount 落定 (空消息回到 hero).
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        //* 新 nonce (再次下发请求) → 照常放行.
        remounted.rerender(chatTree({ ...CTX, sendRequest: { content: '重挂载后的新提问', nonce: 4 } }))
        await screen.findByText('重挂载后的新提问', { selector: '.bubble-text' })
        expect(vi.mocked(streamMessage)).toHaveBeenCalledTimes(2)
    })

    it('新建会话通道 (终审整改): newChatRequest nonce 判重, 同一 nonce 只复位一次, 重放不清已有会话', async () =>
    {
        //* 壳侧栏 "新建会话" 登录态路径经此通道复位 ChatView (startNewChat), 壳不越层操作会话状态.
        //* 会话在场的观测锚是 .bubble-user (chip 题面与气泡文本同串, findByText 会双命中, 沿用访客门测试先例).
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const user = userEvent.setup()
        const utils = renderChat()
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))  //* 先建立会话 (乐观气泡在场).
        expect(document.querySelector('.bubble-user')).not.toBeNull()
        expect(screen.queryByText('你好, 今天想聊点什么?')).not.toBeInTheDocument()
        //* nonce 前进 → startNewChat 复位回 hero.
        utils.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 1 } }))
        await screen.findByText('你好, 今天想聊点什么?')
        expect(document.querySelector('.bubble-user')).toBeNull()  //* 复位已清屏.
        //* 重新建立会话后, 壳层以新对象重放同一 nonce (重渲染/重挂载下发形态) → 台账判重, 不得再次清屏.
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(document.querySelector('.bubble-user')).not.toBeNull()
        utils.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 1 } }))
        expect(document.querySelector('.bubble-user')).not.toBeNull()  //! 同 nonce 重放若清屏, 正在进行的对话会被误杀.
        //* nonce 前进 → 照常放行.
        utils.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 2 } }))
        await screen.findByText('你好, 今天想聊点什么?')
        expect(document.querySelector('.bubble-user')).toBeNull()
    })

    it('新建会话通道重挂载 (模块台账回归): unmount→remount 同 nonce 不重复复位, 新 nonce 放行', async () =>
    {
        //* 消费台账为模块级且跨用例存活 (同文件内模块只加载一次): newChat 通道 nonce 同样全文件单调递增 (上例已消费 1/2).
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const utils = renderChat({ ...CTX, newChatRequest: { nonce: 3 } })
        await screen.findByText('你好, 今天想聊点什么?')  //* mount 即消费 (空态 hero, 复位幂等落定).
        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(document.querySelector('.bubble-user')).not.toBeNull()
        utils.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 3 } }))
        expect(document.querySelector('.bubble-user')).not.toBeNull()  //* 本挂载内同 nonce 重放不清屏.
        utils.unmount()
        //* 同 nonce 重挂载 (扩展节展开整体卸载 → 回会话节): 台账已记账 → 不把已消费请求当新请求重放,
        //* 否则重挂后经 openRequest 恢复的会话会被重放的 startNewChat 误清.
        const remounted = renderChat({ ...CTX, newChatRequest: { nonce: 3 } })
        await screen.findByText('你好, 今天想聊点什么?')  //* remount 落定 (空消息回到 hero).
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(document.querySelector('.bubble-user')).not.toBeNull()
        remounted.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 3 } }))
        expect(document.querySelector('.bubble-user')).not.toBeNull()  //! 模块台账跨挂载: 同 nonce 不清屏.
        remounted.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 4 } }))
        await screen.findByText('你好, 今天想聊点什么?')
        expect(document.querySelector('.bubble-user')).toBeNull()
    })

    it('会话标题 (主区左上): 发送绑定会话后工具条左上显示标题 (sessions 列表为事实源), hero 态无标题', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 历史补拉桩: finalizeSend 会以服务端历史替换乐观气泡 — 必须返回对账后的消息, 返回空数组会把视图打回 hero.
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '我最近压力有点大', ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const sessions: ChatSessionVo[] = [
            { sessionId: 's9', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力', title: '备考夜谈' },
        ]
        const user = userEvent.setup()
        renderChat({ ...CTX, sessions })
        expect(document.querySelector('.chat-title')).toBeNull()  //* hero 空态不渲染标题.
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        await screen.findByText('备考夜谈')  //* meta 绑定 s9 后标题自 sessions 列表取材, 悬于工具条左上.
        expect(document.querySelector('.chat-title')).not.toBeNull()
        expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument()  //* 新对话钮保持在场.
    })

    it('会话标题兜底链 (存量无 title): 回退已加载历史的首条用户消息, 而非干脆不展示', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 历史补拉桩: 返回对账后的消息, 空数组会把视图打回 hero (上一用例同款注释).
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '我最近压力有点大', ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const sessions: ChatSessionVo[] = [
            { sessionId: 's9', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力' },
        ]
        const user = userEvent.setup()
        renderChat({ ...CTX, sessions })
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        await screen.findByText('我在听.')  //* 流式回复到达 (会话已绑定, 消息流在屏).
        expect(document.querySelector('.chat-title')).toHaveTextContent('我最近压力有点大')
    })

    it('会话标题兜底链截断: 首条用户消息超 20 字时截断封顶 (与后端回填同口径)', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const longMessage = '最近考试压力很大, 晚上总是翻来覆去睡不着, 白天也没法集中精神'
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: longMessage, ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const sessions: ChatSessionVo[] = [
            { sessionId: 's9', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力' },
        ]
        const user = userEvent.setup()
        renderChat({ ...CTX, sessions })
        await user.type(screen.getByRole('textbox'), `${longMessage}{Enter}`)
        await screen.findByText('我在听.')
        const titleEl = document.querySelector('.chat-title')
        expect(titleEl).toHaveTextContent(longMessage.slice(0, 20))
        expect(titleEl?.textContent).toHaveLength(20)  //* 封顶断言: 全文含前缀为子串, 仅长度能钉死截断语义.
    })

    it('会话标题兜底链末端: 历史里没有用户消息时退 preview, 皆无则不渲染标题', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 历史仅有助手消息 (无用户消息可取): 兜底链落到 sessions 条目的 preview.
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const sessions: ChatSessionVo[] = [
            { sessionId: 's9', messageCount: 1, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力' },
        ]
        const user = userEvent.setup()
        renderChat({ ...CTX, sessions })
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        await screen.findByText('我在听.')
        expect(document.querySelector('.chat-title')).toHaveTextContent('最近的考试压力')
    })

    //region chips 门禁 (Task 15 用户报告缺陷): 仅 "新会话且尚未开始对话" 在场
    //* 注意: 本文件 newChatRequest 通道的 nonce 台账跨用例单调 (见上方重挂载用例), 新用例必须接在其后使用更大 nonce.
    it('chips 门禁 (Task 15 缺陷): 会话已有消息后隐藏, 新建会话复位 (nonce 前进) 后重新在场', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        const user = userEvent.setup()
        const utils = renderChat()
        expect(screen.getByRole('button', { name: '和我聊聊今天的心情' })).toBeInTheDocument()  //* 新会话空消息: 在场.
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        await screen.findByText('我在听.')  //* 消息流已在屏 (乐观用户气泡 + 流式回复).
        for(const label of ['和我聊聊今天的心情', '我最近压力有点大', '帮我想想怎么放松'])
            expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()  //! 已开始对话: 一律隐藏 (原缺陷: 会话中仍挂在输入框下方).
        //* 壳下发新建会话 (startNewChat 复位): 回到 "新会话未开始对话", chips 重新在场.
        utils.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 5 } }))
        await screen.findByText('你好, 今天想聊点什么?')
        expect(screen.getByRole('button', { name: '和我聊聊今天的心情' })).toBeInTheDocument()
    })

    it('chips 门禁 (Task 15 缺陷): 选中历史会话即隐藏 — 会话 ID 先于历史消息到达, 加载竞态窗口内也不闪现', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '最近的考试压力', ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const sessions: ChatSessionVo[] = [
            { sessionId: 's9', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力', title: '备考夜谈' },
        ]
        renderChat({ ...CTX, sessions, openRequest: { sessionId: 's9', nonce: 1 } })
        expect(screen.queryByRole('button', { name: '和我聊聊今天的心情' })).not.toBeInTheDocument()  //* activeSessionId 非空即隐藏, 不等历史.
        await screen.findByText('我在听.')  //* 历史消息到位: 会话进行中形态.
        expect(screen.queryByRole('button', { name: '帮我想想怎么放松' })).not.toBeInTheDocument()
    })
    //endregion

    //region 每会话输入草稿 (R3+): 切换会话各自保留, 回到原会话恢复; 新建会话草稿独立 (null 键); 发送清当前草稿
    it('会话草稿保留: A 输入 abc -> 切 B (空) -> 输入 xyz -> 切回 A (恢复 abc) -> 新建会话 (空) -> 发送清当前草稿', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 历史空载桩: 只验草稿链路, 切换会话后消息面维持 hero 形态 (不引入消息流干扰断言).
        vi.mocked(listMessages).mockResolvedValue([])
        const sessions: ChatSessionVo[] = [
            { sessionId: 'sA', messageCount: 0, lastUpdateTime: '2026-09-28T10:00:00', preview: '会话A' },
            { sessionId: 'sB', messageCount: 0, lastUpdateTime: '2026-09-27T09:00:00', preview: '会话B' },
        ]
        const box = (): HTMLTextAreaElement => screen.getByRole('textbox') as HTMLTextAreaElement
        const user = userEvent.setup()
        const utils = renderChat({ ...CTX, sessions, openRequest: { sessionId: 'sA', nonce: 1 } })
        await screen.findByText('你好, 今天想聊点什么?')  //* 空历史落定 (hero 形态).
        await user.type(box(), 'abc')
        expect(box()).toHaveValue('abc')
        //* 切到 B: 每会话独立草稿 — B 没写过, 输入框应为空 (原缺陷: 同一 Composer 实例内部态跨会话泄漏).
        utils.rerender(chatTree({ ...CTX, sessions, openRequest: { sessionId: 'sB', nonce: 2 } }))
        expect(box()).toHaveValue('')
        await user.type(box(), 'xyz')
        expect(box()).toHaveValue('xyz')
        //* 切回 A: 草稿台账按会话键恢复.
        utils.rerender(chatTree({ ...CTX, sessions, openRequest: { sessionId: 'sA', nonce: 3 } }))
        expect(box()).toHaveValue('abc')
        //* 新建会话 (null 键独立草稿槽, 本用例从未写过): 输入框为空.
        utils.rerender(chatTree({ ...CTX, sessions, newChatRequest: { nonce: 6 } }))
        expect(box()).toHaveValue('')
        //* 发送清当前草稿: 乐观气泡进管线的同时输入框清空 (台账同步落定).
        await user.type(box(), '待发草稿{Enter}')
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()
        expect(vi.mocked(streamMessage)).toHaveBeenCalledWith(expect.objectContaining({ content: '待发草稿' }))
        expect(box()).toHaveValue('')
    })
    //endregion

    //region 每日总结「」行门禁 (用户报告缺陷): 与 chips 同规 — 仅 "新会话且尚未开始对话" (hero 空态) 在场
    //* newChatRequest 通道 nonce 台账跨用例单调 (见重挂载用例): 本区接在草稿用例 (nonce 6) 之后, 自 nonce 7 起.
    it('每日总结行门禁: 新空会话在场, 已开始对话后隐藏, 新建会话复位后重新在场', async () =>
    {
        stubDailySummary()
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 历史补拉桩: finalizeSend 以服务端历史替换乐观气泡 — 返回对账消息, 空数组会把视图打回 hero (标题用例同款).
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '我最近压力有点大', ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const user = userEvent.setup()
        const utils = renderChat()
        expect(await screen.findByRole('button', { name: `「${DAILY_CONTENT}」` })).toBeInTheDocument()  //* 新会话空消息: 在场.
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        await screen.findByText('我在听.')  //* 消息流已在屏 (乐观用户气泡 + 流式回复).
        expect(screen.queryByRole('button', { name: `「${DAILY_CONTENT}」` })).not.toBeInTheDocument()  //! 已开始对话: 一律隐藏 (原缺陷: 暗色格言渗出在聊天流底部).
        //* 壳下发新建会话 (startNewChat 复位): 回到 "新会话未开始对话", 格言行重新在场.
        utils.rerender(chatTree({ ...CTX, newChatRequest: { nonce: 7 } }))
        await screen.findByText('你好, 今天想聊点什么?')
        expect(await screen.findByRole('button', { name: `「${DAILY_CONTENT}」` })).toBeInTheDocument()
    })

    it('每日总结行门禁: 选中历史会话即隐藏 — 会话 ID 先于历史消息到达, 加载竞态窗口内也不闪现', async () =>
    {
        stubDailySummary()
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '最近的考试压力', ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        const sessions: ChatSessionVo[] = [
            { sessionId: 's9', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力', title: '备考夜谈' },
        ]
        renderChat({ ...CTX, sessions, openRequest: { sessionId: 's9', nonce: 4 } })
        expect(screen.queryByRole('button', { name: `「${DAILY_CONTENT}」` })).not.toBeInTheDocument()  //* activeSessionId 非空即隐藏, 不等历史.
        await screen.findByText('我在听.')  //* 历史消息到位: 会话进行中形态.
        expect(screen.queryByRole('button', { name: `「${DAILY_CONTENT}」` })).not.toBeInTheDocument()
    })
    //endregion

    //region 发送防连点 (核查钉住): 流式在途期间 Composer 整体停用 — 禁用链 ChatView (disabled={streaming})
    //* -> Composer (发送钮/输入框 disabled + submit 逻辑短路), 此处只钉行为不新增实现.
    it('发送防连点: 流式在途期间发送钮 disabled, 点按与再次输入 Enter 均不二次进入发送管线', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 挂起的流 = streaming=true 的在途窗口 (其余用例的回放式桩不受影响, once 实现仅消费一次).
        vi.mocked(streamMessage).mockImplementationOnce(() => new Promise(() => {}))
        const user = userEvent.setup()
        renderChat()
        await user.type(screen.getByRole('textbox'), '第一条消息{Enter}')
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()  //* 首条已进管线, 流在途.
        const send = screen.getByRole('button', { name: '发送' })
        expect(send).toBeDisabled()  //* 在途: 发送钮停用.
        expect(screen.getByRole('textbox')).toBeDisabled()  //* 在途: 输入框同被停用.
        await user.type(screen.getByRole('textbox'), '第二条不该发出去{Enter}')  //* 停用态: 打不进字.
        await user.click(send)  //* 停用态: 点按无效.
        expect(vi.mocked(streamMessage)).toHaveBeenCalledOnce()  //! 防连点: 在途期间二次发送被禁用链拦下.
    })
    //endregion

    //region 思考中等待指示 (用户裁定 2026-10-06): 指示器内嵌于 AI 元信息行 "心灵伙伴" 右侧 (.msg-thinking),
    //* 底部独立等待行与顶栏进度点均已移除 — 流式在途且分片未达时在场, 首分片到达即消失
    it('思考中指示: 内嵌于 AI 元信息行 "心灵伙伴" 右侧 — shimmer-text "思考中" + 三枚同父 svg circle.dotp 错峰', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        vi.mocked(listMessages).mockResolvedValue([])
        //* 受控挂起的流: 只回放 meta 不回放 chunk — 稳定停在 "流式且分片为空" 的等待窗口 (永不 resolve,
        //* 用例末尾 unmount 收尾, 流式在途即本用例语义, 无迟到回调).
        vi.mocked(streamMessage).mockImplementationOnce(() => new Promise(() => {}))
        const user = userEvent.setup()
        const utils = renderChat()
        expect(document.querySelector('.msg-thinking')).toBeNull()  //* 空闲态无思考指示.
        await user.type(screen.getByRole('textbox'), '在吗{Enter}')
        const thinking = document.querySelector('.msg-thinking')
        expect(thinking).not.toBeNull()
        expect(thinking?.querySelector('.shimmer-text')?.textContent).toBe('思考中')
        expect(thinking?.previousElementSibling?.textContent).toBe('心灵伙伴')  //! 位置契约: "心灵伙伴" 右侧.
        const svg = thinking?.querySelector('svg')
        expect(svg).not.toBeNull()
        const dots = svg?.querySelectorAll('circle.dotp') ?? []
        expect(dots).toHaveLength(3)
        //* 结构断言: 三点均为 svg 直接子元素且按文档序排布 — .dotp:nth-child(2/3) 的错峰延迟按兄弟序生效.
        expect(svg?.children[0]).toBe(dots[0])
        expect(svg?.children[1]).toBe(dots[1])
        expect(svg?.children[2]).toBe(dots[2])
        utils.unmount()
    })

    it('首分片到达: 思考行卸载, 分片以 .chunk-in 呈现且尾随 .caret-bar; 流结束光标条移除并转 md 渲染', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 历史补拉桩: 流收尾 finalizeSend 换历史版本 — 返回对账消息, 让 md 渲染有正文可挂.
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '在吗', ts: null },
            { role: 'assistant', content: '我在听.', ts: null },
        ])
        let captured!: IStreamOptions
        let release!: () => void
        const held = new Promise<void>(resolve => { release = resolve })
        vi.mocked(streamMessage).mockImplementationOnce(opts =>
        {
            captured = opts
            return held
        })
        const user = userEvent.setup()
        renderChat()
        await user.type(screen.getByRole('textbox'), '在吗{Enter}')
        expect(document.querySelector('.msg-thinking')).not.toBeNull()  //* 发送即进等待窗口 (分片未达).
        act(() => captured.onChunk('我在听.'))  //* 首分片到达.
        expect(document.querySelector('.msg-thinking')).toBeNull()  //! 思考指示随首分片即消失, 不与分片同屏.
        expect(document.querySelector('.chunk-in')?.textContent).toBe('我在听.')
        expect(document.querySelector('.caret-bar')).not.toBeNull()
        release()  //* 流收尾: streaming 翻 false.
        await waitFor(() => expect(document.querySelector('.caret-bar')).toBeNull())  //* 光标条随流结束移除.
        expect(document.querySelector('.chunk-in')).toBeNull()
        await screen.findByText('我在听.')  //* 正文转 kv-chat-md 渲染落定 (Task 3 通道, 既有断言口径).
    })
    //endregion
})

//region 候选追问接线 (Task 8): 流式 followups 事件 / 历史回放 VO / 点击直发 / 新一轮清空与替换
describe('ChatView (候选追问接线)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.mocked(uploadVoice).mockClear()
        //* mockReset 归位 vi.mock 工厂默认实现 (meta + token, 无 followups): 各用例自布桩互不串扰.
        vi.mocked(streamMessage).mockReset()
        vi.mocked(listMessages).mockReset()
        stubSuccessFetch()
    })

    afterEach(() =>
    {
        vi.unstubAllGlobals()
    })

    //* 生产时序对齐桩: finalizeSend 的历史补拉在流尾事件之后返回 (后端追问先落库后发事件),
    //* 故历史末条 assistant 必须携带同一份 followups, 候选行才不会在补拉瞬间被清掉.
    function stubHistoryWithFollowups(items: string[]): void
    {
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '我最近压力有点大', ts: null },
            { role: 'assistant', content: '我在听.', ts: null, followups: items },
        ])
    }

    it('流式 followups 事件落为最新回复下的候选行, 点击行直发该文本 (与手输同路)', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        stubHistoryWithFollowups(['今晚怎么更快入睡?', '怎么和室友沟通?', '考前呼吸练习怎么做?'])
        vi.mocked(streamMessage).mockImplementation(opts =>
        {
            opts.onMeta('s9')
            opts.onChunk('我在听.')
            opts.onFollowups?.(['今晚怎么更快入睡?', '怎么和室友沟通?', '考前呼吸练习怎么做?'])
            return Promise.resolve()
        })
        const user = userEvent.setup()
        renderChat()
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(await screen.findByRole('button', { name: '今晚怎么更快入睡?' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '考前呼吸练习怎么做?' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '怎么和室友沟通?' }))
        expect(vi.mocked(streamMessage)).toHaveBeenCalledTimes(2)
        expect(vi.mocked(streamMessage)).toHaveBeenLastCalledWith(expect.objectContaining({ content: '怎么和室友沟通?' }))
    })

    it('新一轮发送前清空旧候选: 点击发送瞬间旧候选行离场 (新追问未到)', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        stubHistoryWithFollowups(['旧问一', '旧问二', '旧问三'])
        vi.mocked(streamMessage).
            mockImplementationOnce(opts =>
            {
                opts.onMeta('s9')
                opts.onChunk('我在听.')
                opts.onFollowups?.(['旧问一', '旧问二', '旧问三'])
                return Promise.resolve()
            }).
            mockImplementationOnce(() => new Promise<void>(() => { }))  //* 第二轮挂起: 追问未到.
        const user = userEvent.setup()
        renderChat()
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(await screen.findByRole('button', { name: '旧问一' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '旧问二' }))
        expect(screen.queryByRole('button', { name: '旧问一' })).not.toBeInTheDocument()  //* 发送即清空旧候选.
        expect(screen.queryByRole('button', { name: '旧问三' })).not.toBeInTheDocument()
    })

    it('新回复替换: 新一轮追问到达后旧候选行被整组替换', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        //* 两轮补拉各回各的历史 (后端每轮把追问刷新到最近一条 AI 消息上): 一轮后旧组, 二轮后新组.
        vi.mocked(listMessages).
            mockResolvedValueOnce([
                { role: 'user', content: '我最近压力有点大', ts: null },
                { role: 'assistant', content: '我在听.', ts: null, followups: ['旧问一', '旧问二', '旧问三'] },
            ]).
            mockResolvedValueOnce([
                { role: 'user', content: '我最近压力有点大', ts: null },
                { role: 'assistant', content: '我在听.', ts: null },
                { role: 'user', content: '旧问三', ts: null },
                { role: 'assistant', content: '第二轮回复.', ts: null, followups: ['新问一', '新问二', '新问三'] },
            ])
        vi.mocked(streamMessage).
            mockImplementationOnce(opts =>
            {
                opts.onMeta('s9')
                opts.onChunk('我在听.')
                opts.onFollowups?.(['旧问一', '旧问二', '旧问三'])
                return Promise.resolve()
            }).
            mockImplementationOnce(opts =>
            {
                opts.onMeta('s9')
                opts.onChunk('第二轮回复.')
                opts.onFollowups?.(['新问一', '新问二', '新问三'])
                return Promise.resolve()
            })
        const user = userEvent.setup()
        renderChat()
        await user.click(screen.getByRole('button', { name: '我最近压力有点大' }))
        expect(await screen.findByRole('button', { name: '旧问一' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '旧问三' }))  //* 直发触发二轮.
        expect(await screen.findByRole('button', { name: '新问一' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '新问二' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '旧问一' })).not.toBeInTheDocument()  //* 旧组整组替换.
    })

    it('历史回放: 打开会话即由 VO followups 驱动候选行 (存量 AI 消息带追问)', async () =>
    {
        localStorage.setItem(TOKEN_KEY, AUTHED.token)
        localStorage.setItem(AUTH_KEY, JSON.stringify(AUTHED))
        vi.mocked(listMessages).mockResolvedValue([
            { role: 'user', content: '历史问题', ts: null },
            { role: 'assistant', content: '历史回复', ts: '2026-10-05T09:00:00', followups: ['历一', '历二'] },
        ])
        renderChat({ ...CTX, openRequest: { sessionId: 's9', nonce: 1 } })
        expect(await screen.findByRole('button', { name: '历一' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '历二' })).toBeInTheDocument()
        expect(vi.mocked(streamMessage)).not.toHaveBeenCalled()  //* 历史回放不进发送管线.
    })
})
//endregion
