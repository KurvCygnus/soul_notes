//* 壳与路由测试 (Task 6 重写): 路由表行为 / 访客保护门 / UserMenu 五项开合 / 主题切换持久化 / 主区跟随.
//* C1 ADMIN 双裁定增补: 聊天位对 ADMIN 重定向 /workbench, /extensions 系收归 ADMIN (非 ADMIN 直达回首页
//* 且不开登录门), 扩展页标题转 "扩展治理" 语义 — 数据渲染断言沿用注册表真实桩 (课表聚合卡).
//* 登录态经 persistAuth 预置 (AuthProvider 惰性水合), fetch 全局 stub (会话列表/情境聚合/品牌名等均成功壳,
//* 消费点自行降级, 不产生未处理拒绝). 深链用 window.history.replaceState 预置初始路径 (BrowserRouter 直读 location).
//* Task 8 增补: connectAlertSocket 整体 mock (RED 注入走 AlertContext.test 同款 onRed 回调, 不真开 WebSocket);
//* getCachedHotline 局部 mock 落回 DEFAULT (与真实降级语义一致, 换取时序确定性).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { persistAuth } from './api/auth'
import { getCachedHotline, DEFAULT_HOTLINE } from './api/hotline'
import { connectAlertSocket } from './api/ws'
import { sentinelActive } from './utils/overlayHistory'
import type { AuthData, ChatSessionVo } from './types'

vi.mock('./api/ws', () => ({ connectAlertSocket: vi.fn() }))
vi.mock('./api/hotline', async (importOriginal) =>
{
    return { ...(await importOriginal<typeof import('./api/hotline')>()), getCachedHotline: vi.fn() }
})

const AUTHED: AuthData = { token: 't', userId: 'u1', username: '小明', role: 'STUDENT' }

//* C1 双裁定用例的 ADMIN 身份样本: 聊天位重定向与扩展治理路由的角色基准.
const ADMIN_AUTHED: AuthData = { token: 't', userId: 'u3', username: '管理员', role: 'ADMIN' }

//* 删除流用例的会话样本 (Task 5): 侧栏删除 × / 确认模态 / 塌缩时序三用例共用同一锚定文本.
const DELETE_TARGET: ChatSessionVo = { sessionId: 's1', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力' }

function stubSuccessFetch(): void
{
    //* 每次调用给全新 Response 实例: Response 体一次性, 共享单例会让首个之后的消费者 .json() 全体拒绝,
    //* 消费者集合一变 (如 T9 移除天气胶囊) 取数成败就跟着洗牌 — 桩语义必须是"每个请求独立成功".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ code: 0, message: 'ok', data: [] }), { status: 200 })))
}

//* 会话列表桩 (Task 5 删除流用例): 默认壳桩恒回空列表, 删除确认流无从触发; 覆写 fetch 按路径分流 —
//* 会话列表端点回给定数据 (删除端点同前缀命中, data 无人消费无碍), 其余端点照旧空数据壳自行降级.
function stubSessionsFetch(sessions: ChatSessionVo[]): void
{
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
    {
        const url = typeof input === 'string' ? input : `${input}`
        const data = url.includes('/chat/sessions') ? sessions : []
        return new Response(JSON.stringify({ code: 0, message: 'ok', data }), { status: 200 })
    }))
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

//* C1 用例的登录态预置: ADMIN 身份 (AuthProvider 惰性水合读取).
function loginAsAdmin(): void
{
    persistAuth(ADMIN_AUTHED)
}

function openAt(path: string): void
{
    window.history.replaceState(null, '', path)
}

//* 模拟系统返回键 (哨兵协议用): history.back() 的 popstate 遍历是异步任务, act + 宏任务冲刷让遍历
//* 触发的 setState 落在 act 内 (零警告); 时序敏感的断言侧再配 waitFor 兜底. 按键本体对壳是纯外部事件.
async function pressBack(): Promise<void>
{
    await act(async () =>
    {
        window.history.back()
        await new Promise(resolve => { setTimeout(resolve, 20) })
    })
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
        vi.useRealTimers()  //* 兜底归还真实定时器: 塌缩用例若中途失败, fake timers 会让后续用例的 userEvent 悬挂超时.
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

    it('按压反馈 (Task 5): 发送钮挂 pressable 类 (:active 缩放反馈由 base.css 工具类承载, jsdom 只钉挂点)', async () =>
    {
        render(<App />)
        await settle()
        expect(screen.getByRole('button', { name: '发送' })).toHaveClass('pressable')
    })

    it('访客菜单 (红线闭合): 危机支持无门直达热线占位, 门保护项触发登录门, 个人资料/登出隐藏', async () =>
    {
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(screen.getAllByRole('menuitem').map(el => el.textContent)).
            toEqual(['危机支持', '设置'])  //* 个人资料对访客隐藏 (无账号), 登出对访客无意义, 关于项已退场 (走查裁决 2026-10-03).

        //* 公开能力: 危机支持直开热线占位, 登录浮层不得在场 (对访客无门).
        await user.click(screen.getByRole('menuitem', { name: '危机支持' }))
        expect(screen.getByRole('dialog', { name: '危机支持' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: /登录/ })).not.toBeInTheDocument()

        //* 门保护项: 上抛壳过登录门 (不导航不渲染受保护页), 菜单收起; 取消复位后逐项验证.
        await user.click(screen.getByRole('button', { name: '我知道了' }))
        for(const item of ['设置'])
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
        //* /extensions 系已收归 ADMIN (C1 双裁定, 走 RequireAdmin 直弹回首页不开门), 门语义用例只剩 资料/设置.
        for(const path of ['/profile', '/settings'])
        {
            cleanup()
            openAt(path)
            render(<App />)
            expect(await screen.findByRole('dialog')).toBeInTheDocument()
            await settle()
            expect(screen.queryByText('建设中')).not.toBeInTheDocument()
        }
    })

    it('扩展治理门禁 (C1): 访客/STUDENT/COUNSELOR 直达 /extensions 一律重定向回首页聊天位, 且登录门不开', async () =>
    {
        //* 刻意不含访客登录门路径: 扩展入口对非 ADMIN 整体退场, 登录与否都无权到达治理视角 —
        //* 若此处开了登录浮层即回归 (登录后仍被弹回的死路).
        const presets: ReadonlyArray<AuthData | null> = [null, { ...AUTHED, role: 'STUDENT' }, { ...AUTHED, role: 'COUNSELOR' }]
        for(const preset of presets)
        {
            for(const path of ['/extensions', '/extensions/timetable'])
            {
                cleanup()
                if(preset != null)
                    persistAuth(preset)
                openAt(path)
                render(<App />)
                expect(await screen.findByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
                await settle()
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument()  //* 登录门不开 (RequireAdmin 直弹回).
                expect(screen.queryByRole('heading', { name: '扩展治理' })).not.toBeInTheDocument()
            }
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

    it('/extensions (ADMIN, C1): 渲染扩展治理总览 — 标题换治理语义, 数据渲染保留 (聚合卡在场)', async () =>
    {
        loginAsAdmin()
        openAt('/extensions')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '扩展治理' })).toBeInTheDocument()
        await settle()
        expect(screen.getByText('今日课表摘要')).toBeInTheDocument()
    })

    it('/extensions/:id 命中 (ADMIN): 渲染该扩展页 (query 注入 context 取数)', async () =>
    {
        loginAsAdmin()
        openAt('/extensions/timetable')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '课表' })).toBeInTheDocument()
        await settle()
    })

    it('/extensions/:id 未命中 (ADMIN): 重定向 /extensions (扩展治理总览兜底)', async () =>
    {
        loginAsAdmin()
        openAt('/extensions/nope')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '扩展治理' })).toBeInTheDocument()
        await settle()
    })

    it('/profile: 页头 + 建设中占位 (/about 已随菜单项退场)', async () =>
    {
        loginLocally()
        openAt('/profile')
        render(<App />)
        expect(await screen.findByRole('heading', { name: '个人资料' })).toBeInTheDocument()
        await settle()
        expect(screen.getByText('建设中')).toBeInTheDocument()
    })

    it('/about /crisis 与未知路由: 一律重定向回首页聊天位 (关于/危机页不再作为路由存在)', async () =>
    {
        loginLocally()
        for(const path of ['/about', '/crisis', '/nowhere'])
        {
            cleanup()
            openAt(path)
            render(<App />)
            expect(await screen.findByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
            await settle()
            expect(screen.queryByText('如果你此刻感到不安全')).not.toBeInTheDocument()
        }
    })

    it('主区跟随 (C1 角色分区): ADMIN 点扩展治理节 -> 壳导航 /extensions 渲染治理总览; STUDENT 点会话节 -> 回首页聊天位', async () =>
    {
        loginAsAdmin()
        const user = userEvent.setup()
        render(<App />)
        await settle()  //* ADMIN 落在工作台 (聊天位重定向), 侧栏仅 工作台/扩展治理/设置 三入口.
        await user.click(screen.getByRole('button', { name: '扩展治理' }))
        expect(await screen.findByRole('heading', { name: '扩展治理' })).toBeInTheDocument()
        cleanup()

        loginLocally()  //* STUDENT 反例: 扩展治理节退场, 会话节标题照常上抛壳并导航回聊天位.
        openAt('/')
        render(<App />)
        await settle()
        expect(screen.queryByRole('button', { name: '扩展治理' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '会话' }))
        expect(await screen.findByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
    })

    it('UserMenu: 汉堡开合, 四项按序 (危机支持/个人资料/设置/登出), Escape 与遮罩点击关闭', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(screen.getByRole('menu', { name: '用户菜单' })).toBeInTheDocument()
        expect(screen.getAllByRole('menuitem').map(el => el.textContent)).
            toEqual(['危机支持', '个人资料', '设置', '登出'])

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())  //* 退场动画簿记: 淡出完才真卸载.

        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        fireEvent.click(document.querySelector('.user-menu-mask')!)  //* 遮罩 aria-hidden 不在可访问性树, 走 fireEvent 直派.
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
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

    it('UserMenu 菜单项: 个人资料/设置 各自导航并收起菜单 (关于项已退场)', async () =>
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
        expect(screen.queryByRole('menuitem', { name: '关于' })).not.toBeInTheDocument()
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

    it('抽屉内 ≡ 菜单导航后自动收抽屉 (Task 15 台账): 设置导航与危机支持入口均关 drawer', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))  //* 顶栏汉堡开抽屉.
        expect(screen.getByRole('button', { name: '关闭导航菜单' })).toBeInTheDocument()  //* aria 标签随开合换向.
        expect(document.querySelector('.drawer-overlay')).not.toBeNull()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))  //* 抽屉内头像行汉堡开用户菜单.
        await user.click(screen.getByRole('menuitem', { name: '设置' }))
        expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()
        expect(document.querySelector('.drawer-overlay')).toBeNull()  //* drawerOpen 归 false 的可观测证据: 遮罩卸载.
        expect(screen.getByRole('button', { name: '打开导航菜单' })).toBeInTheDocument()  //* 汉堡开合标签复位.

        //* 危机支持入口 (开 Flyout 而非路由) 同样必须收抽屉 — 危机浮层独占屏幕.
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))
        expect(document.querySelector('.drawer-overlay')).not.toBeNull()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '危机支持' }))
        expect(screen.getByRole('dialog', { name: '危机支持' })).toBeInTheDocument()
        expect(document.querySelector('.drawer-overlay')).toBeNull()
    })

    it('抽屉头部 X 关闭钮 (R1 走查整改): 桌面态不渲染; 抽屉态点击后 drawerOpen 归 false (遮罩卸载)', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        expect(screen.queryByRole('button', { name: '关闭菜单' })).not.toBeInTheDocument()  //* 桌面形态 (抽屉未开) 无关闭钮.
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))  //* 顶栏汉堡开抽屉.
        expect(screen.getByRole('button', { name: '关闭菜单' })).toBeInTheDocument()  //* 抽屉态头部显式 X 在场.
        await user.click(screen.getByRole('button', { name: '关闭菜单' }))
        expect(document.querySelector('.drawer-overlay')).toBeNull()  //* drawerOpen 归 false 的可观测证据: 遮罩卸载.
        expect(screen.getByRole('button', { name: '打开导航菜单' })).toBeInTheDocument()  //* 汉堡开合标签复位.
    })

    it('抽屉打开按 BACK: 返回只关抽屉 — 不退路由不退 app (浮层栈 drawer 档)', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))  //* 顶栏汉堡开抽屉.
        expect(document.querySelector('.drawer-overlay')).not.toBeNull()
        expect(window.history.state).toMatchObject({ soulOverlay: true })  //* 抽屉计入浮层计数: 哨兵 entry 已压栈.
        await pressBack()  //* 返回消费哨兵: popstate 命中 drawer 档 (RED > confirm > menu > crisis > drawer 阶梯末端).
        await waitFor(() => expect(document.querySelector('.drawer-overlay')).toBeNull())  //* 只关抽屉.
        expect(screen.getByRole('button', { name: '打开导航菜单' })).toBeInTheDocument()  //* 汉堡标签复位 (drawerOpen 归 false).
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()  //* 路由未退: 仍在聊天位.
        await waitFor(() => expect(sentinelActive()).toBe(false))  //* 收尾卫生: 哨兵收栈归零, 下方 RED 哨兵用例从零压栈.
    })

    //* 哨兵协议 RED 红线闭环 (spec §5.2, 评审 Important-1/2). 三用例顺序依赖: 前一用例收尾把哨兵
    //* 变量归零 (overlayHistory 模块态跨用例存活, 同文件共享), 后一用例的压栈才是真推 — 勿乱序重排.
    it('RED 独在场: 弹出即压哨兵, 返回键被吞 — RED 不退场, 路由不退 (Important-2)', async () =>
    {
        loginLocally()
        render(<App />)
        await settle()
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        expect(onRed).toBeInstanceOf(Function)
        act(() => onRed?.({ type: 'RED_ALERT', reason: '独在场' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(window.history.state).toMatchObject({ soulOverlay: true })  //* 无浮层时弹 RED 也立即压哨兵

        await pressBack()  //* 第一次返回: 消费哨兵 entry -> popstate 五连不中 + RED 在场 -> 重推
        await waitFor(() => expect(window.history.state).toMatchObject({ soulOverlay: true }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()  //* RED 仍在屏, 未被返回键关闭

        await pressBack()  //* 第二次返回: 重推的哨兵再消费再重推 — 消费/重推一一对应, 永不退真路由
        await waitFor(() => expect(window.history.state).toMatchObject({ soulOverlay: true }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: '我知道了' }))  //* 收尾卫生: 显式关闭归零哨兵变量.
        await waitFor(() => expect(sentinelActive()).toBe(false))
    })

    it('RED + 普通浮层叠开: 返回正常关最上层浮层; 浮层尽后再返回, RED 独守不退场', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        act(() => onRed?.({ type: 'RED_ALERT', reason: '叠开' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(screen.getByRole('menu', { name: '用户菜单' })).toBeInTheDocument()

        await pressBack()  //* 第一次返回: 正常消费 — popstate 关最上层浮层 (菜单), RED 不随返
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        await pressBack()  //* 第二次返回: 浮层已尽, RED 独守 — 五连不中重推哨兵, 不退真路由
        await waitFor(() => expect(window.history.state).toMatchObject({ soulOverlay: true }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: '我知道了' }))  //* 收尾卫生: 显式关闭归零哨兵变量.
        await waitFor(() => expect(sentinelActive()).toBe(false))
    })

    it('RED 显式"我知道了"收场: 哨兵收栈干净 — RED 卸载, 模块计数归零', async () =>
    {
        loginLocally()
        render(<App />)
        await settle()
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        act(() => onRed?.({ type: 'RED_ALERT', reason: '收场' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(window.history.state).toMatchObject({ soulOverlay: true })  //* 上一用例已归零, 此处压栈是真推 (防 opened() no-op 假阳性)

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: '我知道了' }))
        await waitFor(() => expect(sentinelActive()).toBe(false))  //* dismissRed -> 计数归零 -> overlayClosed 收回栈顶哨兵
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('RED + 危机浮层叠开 (R2 闭环): 返回消费浮层后哨兵 entry 即补回 — 每次返回都不净耗历史栈', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        await user.click(screen.getByRole('menuitem', { name: '危机支持' }))
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        act(() => onRed?.({ type: 'RED_ALERT', reason: '叠开消费' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: '危机支持' })).toBeInTheDocument()

        await pressBack()  //* 返回一次: 消费危机浮层 — 关浮层的同时哨兵 entry 必须已补回 (R2: 不得净消耗)
        await waitFor(() => expect(screen.queryByRole('dialog', { name: '危机支持' })).not.toBeInTheDocument())
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()  //* RED 不随返
        expect(window.history.state).toMatchObject({ soulOverlay: true })  //* 消费浮层分支已补回哨兵 (R2 断言核心)

        await pressBack()  //* 再返回: 被吞 (重推) — 不退真路由, RED 仍在屏
        await waitFor(() => expect(window.history.state).toMatchObject({ soulOverlay: true }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '我知道了' }))
        await waitFor(() => expect(sentinelActive()).toBe(false))  //* 收尾卫生: 显式关闭归零哨兵变量.
    })

    it('RED 在屏手势互斥 (R2 核查): 左缘侧滑不得开抽屉 — 汉堡/行滑动被 RED 遮罩压盖, 开抽屉手势必须同闭', async () =>
    {
        //* 手势门禁按 (max-width: 767px) 判定: 用例内装小屏桩 (afterEach 的 unstubAllGlobals 统一归还).
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }))
        //* jsdom 无 TouchEvent 构造器: 手工构造带 touches/changedTouches 的冒泡事件派发到 document
        //* (开抽屉手势监听在 document 级 — 正因如此它越过 RED 遮罩, 是本用例钉住的互斥点).
        const fireTouch = (type: 'touchstart' | 'touchmove' | 'touchend', x: number): void =>
        {
            const touch = { identifier: 1, clientX: x, clientY: 100 } as unknown as Touch
            const event = new Event(type, { bubbles: true, cancelable: true })
            Object.defineProperty(event, 'touches', { value: [touch] })
            Object.defineProperty(event, 'changedTouches', { value: [touch] })
            document.dispatchEvent(event)
        }
        loginLocally()
        render(<App />)
        await settle()
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        expect(onRed).toBeInstanceOf(Function)
        act(() => onRed?.({ type: 'RED_ALERT', reason: '手势互斥' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        fireTouch('touchstart', 10)  //* 屏幕左缘 24px 触发带内.
        fireTouch('touchmove', 84)  //* dx = 74, 过提交阈值 (64px).
        fireTouch('touchend', 84)
        expect(document.querySelector('.drawer-overlay')).toBeNull()  //* RED 在屏: 开抽屉手势必须被门禁吞掉.
        expect(screen.getByRole('button', { name: '打开导航菜单' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()  //* RED 不受手势扰动.

        //* 收尾卫生: 显式关闭归零哨兵 (overlayHistory 模块态跨用例, 勿留悬空 entry 干扰后续用例).
        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: '我知道了' }))
        await waitFor(() => expect(sentinelActive()).toBe(false))
    })

    //region Task 5 动效接线: 弹层 pop-origin 入场 / 删除行塌缩退场 / 抽屉视差状态类
    //* 弹层家族入场挂点断言只钉类在位性: 动画本体 (pop-in keyframes) 归 base.css, jsdom 不求值 CSS.
    it('弹层入场 (Task 5): 触发删除确认后, 确认框面板挂 pop-origin 与 enter 入场类 (挂载即播)', async () =>
    {
        loginLocally()
        stubSessionsFetch([DELETE_TARGET])
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '删除会话: 最近的考试压力' }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(document.querySelector('.confirm-modal-panel')).toHaveClass('pop-origin', 'enter')
    })

    it('弹层入场 (Task 5): 用户菜单挂 pop-origin 与 enter 入场类 (退场仍走既有 closing 淡出, 不做 pop 退场)', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(screen.getByRole('menu', { name: '用户菜单' })).toHaveClass('pop-origin', 'enter')
    })

    it('删除塌缩动效 (Task 5): 确认后行先挂 row-collapse/gone 塌缩, 220ms (--dur-enter) 窗口走完才经删除管线卸载', async () =>
    {
        vi.useFakeTimers()
        try
        {
            loginLocally()
            stubSessionsFetch([DELETE_TARGET])
            render(<App />)
            await settle()
            //* 点击走 fireEvent 而非 userEvent: 后者的指针序列在 fake timers 下悬挂 (与 advanceTimers 配置无关),
            //* fireEvent 同步派发无定时器依赖, 断言的 220ms 窗口完全由显式 advanceTimersByTime 驱动.
            fireEvent.click(screen.getByRole('button', { name: '删除会话: 最近的考试压力' }))  //* 侧栏 ×: 请求删除, 壳开确认模态.
            fireEvent.click(screen.getByRole('button', { name: '删除' }))  //* 确认: 目标行进入塌缩窗口.
            const row = document.querySelector('[data-session-id="s1"]')
            expect(row).toHaveClass('row-collapse', 'gone')  //* 确认即塌缩: 行先播退场 (左移淡出 + 高度收零).
            expect(row).toBeInTheDocument()  //! 塌缩窗口内行必须在列表 (卸载只能等窗口走完的删除管线驱动).
            await act(async () =>
            {
                vi.advanceTimersByTime(220)
                for(let i = 0; i < 8; i++)
                    await Promise.resolve()  //* 冲刷删除请求的 fetch/解包微任务链, 令列表滤除的 setState 落在 act 内.
            })
            expect(document.querySelector('[data-session-id="s1"]')).toBeNull()  //* 窗口走完: 行经既有管线卸载.
        }
        finally
        {
            vi.useRealTimers()
        }
    })

    it('删除失败回滚 (Task 6 顺修钉子): delete 端点 reject → 行保留可重试, 塌缩类与内联行高摘净不留隐形行', async () =>
    {
        vi.useFakeTimers()
        try
        {
            loginLocally()
            //* 覆写 fetch: DELETE /chat/sessions/{id} 回非 JSON 的 HTTP 500 (网关错误页形态), 其余端点照旧成功 —
            //* api() 解包失败降级 ApiError(500), 壳层 catch 走回滚分支.
            vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
            {
                const url = typeof input === 'string' ? input : `${input}`
                if(url.includes('/chat/sessions') && init?.method === 'DELETE')
                    return new Response('gateway error', { status: 500 })
                const data = url.includes('/chat/sessions') ? [DELETE_TARGET] : []
                return new Response(JSON.stringify({ code: 0, message: 'ok', data }), { status: 200 })
            }))
            render(<App />)
            await settle()
            fireEvent.click(screen.getByRole('button', { name: '删除会话: 最近的考试压力' }))
            fireEvent.click(screen.getByRole('button', { name: '删除' }))
            expect(document.querySelector('[data-session-id="s1"]')).toHaveClass('row-collapse', 'gone')  //* 塌缩先行.
            await act(async () =>
            {
                vi.advanceTimersByTime(220)
                for(let i = 0; i < 8; i++)
                    await Promise.resolve()  //* 冲刷删除请求的微任务链: reject 分支的回滚 setState 落在 act 内.
            })
            const row = document.querySelector('[data-session-id="s1"]')
            expect(row).toBeInTheDocument()  //! 失败保留原会话可重试 (不静默吞错的管线语义).
            expect(row).not.toHaveClass('row-collapse', 'gone')  //* 塌缩类摘净: 行不得永久隐形.
            expect(row?.getAttribute('style') ?? '').not.toContain('height')  //* 内联行高摘净 (塌缩前的像素钉高).
            expect(screen.getByRole('status').textContent).toContain('会话删除失败')  //* toast 提示在场.
        }
        finally
        {
            vi.useRealTimers()
        }
    })

    it('抽屉视差 (Task 5): 抽屉开态壳挂 drawer-aux 类 (CSS 媒体查询据此给 .main 加视差位移), 关态移除', async () =>
    {
        loginLocally()
        const user = userEvent.setup()
        render(<App />)
        await settle()
        const shell = document.querySelector('.shell')
        expect(shell).not.toHaveClass('drawer-aux')
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))  //* 顶栏汉堡开抽屉.
        expect(shell).toHaveClass('drawer-aux')
        await user.click(screen.getByRole('button', { name: '关闭菜单' }))  //* 抽屉头部显式 X 关抽屉.
        expect(shell).not.toHaveClass('drawer-aux')
    })
    //endregion

    //region 工作台路由与角色门禁: /workbench 仅 COUNSELOR/ADMIN 可达, 侧栏入口同门禁
    it('工作台门禁 (STUDENT 反例): 侧栏无工作台入口, 直达 /workbench 重定向回首页聊天位', async () =>
    {
        loginLocally()  //* role: STUDENT
        openAt('/workbench')
        render(<App />)
        await settle()
        expect(screen.queryByRole('button', { name: '工作台' })).not.toBeInTheDocument()  //* 入口对学生不可见.
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()  //* 直达被门禁弹回首页.
    })

    it('工作台门禁 (COUNSELOR): 侧栏工作台入口在场, 点击进入工作台渲染空态队列', async () =>
    {
        persistAuth({ ...AUTHED, role: 'COUNSELOR' })
        const user = userEvent.setup()
        render(<App />)
        await settle()
        await user.click(screen.getByRole('button', { name: '工作台' }))
        expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument()
        expect(await screen.findByText('暂无风险评估记录')).toBeInTheDocument()  //* 通用成功壳桩回空数据 -> 队列空态.
    })

    it('ADMIN 直达聊天主视图 (C1): 重定向 /workbench; 侧栏无会话区, 扩展治理/设置入口在场且可用', async () =>
    {
        loginAsAdmin()
        const user = userEvent.setup()
        render(<App />)
        expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument()  //* 聊天位对 ADMIN 重定向工作台.
        await settle()
        expect(screen.queryByRole('heading', { name: '你好, 今天想聊点什么?' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '会话' })).not.toBeInTheDocument()  //* C1: ADMIN 侧栏无会话区 (节标题 + 新建会话同闭).
        expect(screen.queryByRole('button', { name: '新建会话' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '工作台' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '扩展治理' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '设置' }))
        expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()  //* 侧栏设置行直达设置页.
    })
    //endregion
})
