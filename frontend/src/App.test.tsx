//* 壳与路由测试 (Task 6 重写): 路由表行为 / 访客保护门 / UserMenu 五项开合 / 主题切换持久化 / 主区跟随.
//* 登录态经 persistAuth 预置 (AuthProvider 惰性水合), fetch 全局 stub (会话列表/情境聚合/品牌名等均成功壳,
//* 消费点自行降级, 不产生未处理拒绝). 深链用 window.history.replaceState 预置初始路径 (BrowserRouter 直读 location).
//* Task 8 增补: connectAlertSocket 整体 mock (RED 注入走 AlertContext.test 同款 onRed 回调, 不真开 WebSocket);
//* getCachedHotline 局部 mock 落回 DEFAULT (与真实降级语义一致, 换取时序确定性).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { persistAuth } from './api/auth'
import { getCachedHotline, DEFAULT_HOTLINE } from './api/hotline'
import { connectAlertSocket } from './api/ws'
import type { AuthData } from './types'

vi.mock('./api/ws', () => ({ connectAlertSocket: vi.fn() }))
vi.mock('./api/hotline', async (importOriginal) =>
{
    return { ...(await importOriginal<typeof import('./api/hotline')>()), getCachedHotline: vi.fn() }
})

const AUTHED: AuthData = { token: 't', userId: 'u1', username: '小明', role: 'STUDENT' }

function stubSuccessFetch(): void
{
    //* 每次调用给全新 Response 实例: Response 体一次性, 共享单例会让首个之后的消费者 .json() 全体拒绝,
    //* 消费者集合一变 (如 T9 移除天气胶囊) 取数成败就跟着洗牌 — 桩语义必须是"每个请求独立成功".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ code: 0, message: 'ok', data: [] }), { status: 200 })))
}

//* 冲刷挂载后的异步回填 (品牌名/会话列表/每日总结/扩展取数的 fetch 微任务链): 令 setState 落在 act 内,
//* 测试输出零警告. 链路很短, 固定轮数的微任务让步足够 (与 [[useChatGate.test]] 的 flushCascade 同形).
async function settle(): Promise<void>
{
    await act(async () =>
    {
        for(let i = 0; i < 5; i++)
            await Promise.resolve()
    })
}

function loginLocally(): void
{
    persistAuth(AUTHED)
}

function openAt(path: string): void
{
    window.history.replaceState(null, '', path)
}

describe('App (壳与路由 v2)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        openAt('/')
        stubSuccessFetch()
        //* 显式清 mock 状态 (仓库约定, AlertContext/CrisisFlyout 测试同款): RED 交接用例锚定 connectAlertSocket
        //* 的 onRed 回调, 若调用历史跨测试累积, calls[0] 会落到陈旧 provider — clearAllMocks 保证 RED 注入
        //* 永远命中本用例自己的建连, 顺序无关不靠 runner 隐式默认.
        vi.clearAllMocks()
        vi.mocked(connectAlertSocket).mockReturnValue(vi.fn())//* 登录壳建连后 user 变迁的 cleanup 需要可调用的关闭函数
        vi.mocked(getCachedHotline).mockResolvedValue(DEFAULT_HOTLINE)//* 危机浮层刷新落回内置默认 (与真实降级同值)
    })
    afterEach(() =>
    {
        cleanup()
        vi.unstubAllGlobals()
        delete document.documentElement.dataset.theme  //* 主题测试改写 <html> 态, 用例间复位防串扰.
    })

    it('首页 (聊天位, Task 9): ChatView 在场 — hero + 输入框 + 内置 chips, 公开不触发登录门', async () =>
    {
        render(<App />)
        await settle()
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '和我聊聊今天的心情' })).toBeInTheDocument()  //* D25 内置文案集 (注册表零贡献时全亮).
        expect(screen.getByRole('button', { name: '登录 / 注册' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '打开菜单' })).toBeInTheDocument()  //* 访客头像行双件套: 登录钮 + 汉堡 (红线: 危机入口对访客可达).
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('访客菜单 (红线闭合): 危机支持无门直达热线占位, 门保护项触发登录门, 登出隐藏', async () =>
    {
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(screen.getAllByRole('menuitem').map(el => el.textContent)).
            toEqual(['危机支持', '个人资料', '设置', '关于'])  //* 登出对访客无意义, 隐藏.

        //* 公开能力: 危机支持直开热线占位, 登录浮层不得在场 (对访客无门).
        await user.click(screen.getByRole('menuitem', { name: '危机支持' }))
        expect(screen.getByRole('dialog', { name: '危机支持' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: /登录/ })).not.toBeInTheDocument()

        //* 门保护项: 上抛壳过登录门 (不导航不渲染受保护页), 菜单收起; 取消复位后逐项验证.
        await user.click(screen.getByRole('button', { name: '我知道了' }))
        for(const item of ['个人资料', '设置', '关于'])
        {
            await user.click(screen.getByRole('button', { name: '打开菜单' }))
            await user.click(screen.getByRole('menuitem', { name: item }))
            expect(await screen.findByRole('dialog', { name: /登录/ })).toBeInTheDocument()
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: item })).not.toBeInTheDocument()
            fireEvent.click(screen.getByRole('button', { name: '取消' }))  //* 显式取消关门 (浮层无遮罩点击关闭), 下一轮重开.
            await settle()
        }
    })

    it('访客进入受保护路由: 不渲染页面内容并触发登录门 (gate.open -> 登录浮层在场)', async () =>
    {
        for(const path of ['/extensions', '/extensions/mock-timetable', '/profile', '/settings', '/about'])
        {
            cleanup()
            openAt(path)
            render(<App />)
            expect(await screen.findByRole('dialog')).toBeInTheDocument()
            await settle()
            expect(screen.queryByText('建设中')).not.toBeInTheDocument()
        }
    })

    it('/settings: 主题分段控件, 点暮蓝即时生效 (data-theme) 并持久化 (soul.theme), aria-pressed 随选翻转', async () =>
    {
        loginLocally()
        openAt('/settings')
        const user = userEvent.setup()
        render(<App />)
        const sage = await screen.findByRole('button', { name: '雾杉' })
        await settle()
        const dusk = screen.getByRole('button', { name: '暮蓝' })
        expect(sage).toHaveAttribute('aria-pressed', 'true')
        expect(dusk).toHaveAttribute('aria-pressed', 'false')
        expect(document.documentElement.dataset.theme).toBe('sage')  //* 挂载即对齐存储值 (缺省雾杉).

        await user.click(dusk)
        expect(document.documentElement.dataset.theme).toBe('dusk')
        expect(localStorage.getItem('soul.theme')).toBe('dusk')
        expect(sage).toHaveAttribute('aria-pressed', 'false')
        expect(dusk).toHaveAttribute('aria-pressed', 'true')

        await user.click(sage)
        expect(document.documentElement.dataset.theme).toBe('sage')
        expect(localStorage.getItem('soul.theme')).toBe('sage')
    })

    it('/settings 深链: 预置暮蓝偏好时挂载即应用 dusk (直接导航不脱节)', async () =>
    {
        loginLocally()
        localStorage.setItem('soul.theme', 'dusk')
        openAt('/settings')
        render(<App />)
        await settle()
        expect(document.documentElement.dataset.theme).toBe('dusk')
    })

    it('/settings 定稿: 主题+外观双分段控件在场, 无建设中占位 (页面已定稿)', async () =>
    {
        loginLocally()
        openAt('/settings')
        render(<App />)
        expect(await screen.findByRole('group', { name: '外观选择' })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: '主题选择' })).toBeInTheDocument()
        expect(screen.queryByText('建设中')).not.toBeInTheDocument()
        await settle()
    })

    it('/extensions: overviewProvider 在场 -> 渲染总览 (dev 注册表含 mock 课表)', async () =>
    {
        loginLocally()
        openAt('/extensions')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '总览' })).toBeInTheDocument()
        await settle()
        expect(screen.getByText('今日课表摘要')).toBeInTheDocument()
    })

    it('/extensions/:id 命中: 渲染该扩展页 (query 注入 context 取数)', async () =>
    {
        loginLocally()
        openAt('/extensions/mock-timetable')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '课表' })).toBeInTheDocument()
        await settle()
    })

    it('/extensions/:id 未命中: 重定向 /extensions (总览兜底)', async () =>
    {
        loginLocally()
        openAt('/extensions/nope')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '总览' })).toBeInTheDocument()
        await settle()
    })

    it('/profile 与 /about: 页头 + 建设中占位', async () =>
    {
        loginLocally()
        for(const [path, title] of [['/profile', '个人资料'], ['/about', '关于']] as const)
        {
            cleanup()
            openAt(path)
            render(<App />)
            expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
            await settle()
            expect(screen.getByText('建设中')).toBeInTheDocument()
        }
    })

    it('/crisis 与未知路由: 一律重定向回首页聊天位 (危机页不再作为路由存在)', async () =>
    {
        loginLocally()
        for(const path of ['/crisis', '/nowhere'])
        {
            cleanup()
            openAt(path)
            render(<App />)
            expect(await screen.findByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
            await settle()
            expect(screen.queryByText('如果你此刻感到不安全')).not.toBeInTheDocument()
        }
    })

    it('主区跟随: 点扩展节标题 -> 壳导航 /extensions 渲染总览; 点会话节 -> 回首页聊天位', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '扩展' }))
        expect(await screen.findByRole('heading', { name: '总览' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '会话' }))
        expect(await screen.findByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
    })

    it('UserMenu: 汉堡开合, 五项按序 (危机支持/个人资料/设置/登出/关于), Escape 与遮罩点击关闭', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(screen.getByRole('menu', { name: '用户菜单' })).toBeInTheDocument()
        expect(screen.getAllByRole('menuitem').map(el => el.textContent)).
            toEqual(['危机支持', '个人资料', '设置', '登出', '关于'])

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        fireEvent.click(document.querySelector('.user-menu-mask')!)  //* 遮罩 aria-hidden 不在可访问性树, 走 fireEvent 直派.
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('UserMenu 危机支持: 上抛壳 crisisOpen -> 占位浮层在场 (热线号码可达), 菜单收起, 可关闭', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '危机支持' }))
        const dlg = screen.getByRole('dialog', { name: '危机支持' })
        expect(within(dlg).getByText(DEFAULT_HOTLINE.primary)).toBeInTheDocument()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        await user.click(within(dlg).getByRole('button', { name: '我知道了' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('RED -> 危机 Flyout 壳级交接: 查看全部求助资源 关 RED 并开 Flyout, 交接断链即 Flyout 缺席', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        //* 经 WS 通道回调注入 RED (AlertContext.test 同款模式): 壳应渲染 RED 安全模态, Flyout 不在场.
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        expect(onRed).toBeInstanceOf(Function)
        act(() => onRed?.({ type: 'RED_ALERT', reason: '壳级交接' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: '危机支持' })).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: '查看全部求助资源' }))
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()//* RED 先关 (壳 dismissRed)
        const flyout = screen.getByRole('dialog', { name: '危机支持' })//* Flyout 后开 (壳 setCrisisOpen) — 双断言缺一即交接断链
        expect(within(flyout).getByRole('link', { name: '400-161-9995' })).toHaveAttribute('href', 'tel:400-161-9995')
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()//* 红线: RED 不被 Flyout 遮挡, 两者不同时在场
    })

    it('UserMenu 菜单项: 个人资料/设置/关于 各自导航并收起菜单', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '设置' }))
        expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '个人资料' }))
        expect(await screen.findByRole('heading', { name: '个人资料' })).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '关于' }))
        expect(await screen.findByRole('heading', { name: '关于' })).toBeInTheDocument()
    })

    it('登出: 回访客态 (登录入口在场), 落回首页聊天位, 菜单收起', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '登出' }))
        expect(await screen.findByRole('button', { name: '登录 / 注册' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
})
