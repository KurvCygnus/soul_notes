//* 手风琴侧栏测试 (v2 重写): 节标题上抛 / 条目无框 / 扩展条目经注册表 / 总览条件渲染 / 折叠图标列 / 头像行双态 / 删除直上抛.
//* 契约与旧版一致: 壳仅对访客传 onOpenLogin, 该 prop 在场即访客态; 登录态的用户名经 useAuth 注入 (新契约无 user prop).
//* 扩展条目数据来自 extensions/registry — vi.mock 以 getter 形态暴露, 用例间可变装注册表 (总览有/无两装).
//* Task 6: 置顶/重命名 API 整体 mock (接口层先行, 端点 Task 8 后端落地), 接线用例断言 api 调用与列表更新.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactElement } from 'react'
import Sidebar, { SIDEBAR_PREF_KEY } from './Sidebar'
import { pinSession, renameSession } from '../../api/chat'
import { toast } from '../../utils/toast'
import type { ISidebarProps } from './Sidebar'
import type { IExtensionPoint } from '../../extensions/types'
import type { AuthData, ChatSessionVo } from '../../types'

//* 会话管理端点 mock (Task 6): 侧栏直连 pinSession/renameSession (乐观本地落定), 默认成功态,
//* 失败用例在用例内覆写 reject. 其余导出 (listSessions 等) 侧栏不消费, 无需保真.
vi.mock('../../api/chat', () => ({
    pinSession: vi.fn(),
    renameSession: vi.fn(),
}))
//* toast 也整体 mock: 侧栏用例不挂 ToastHost, 断言走到模块边界即可 (提示渲染归 App 壳测试口径).
vi.mock('../../utils/toast', () => ({ toast: vi.fn() }))

//* 注册表 mock: getter 让组件每次渲染读到最新值, 用例内改写即生效 (总览条目 D9 运行期条件的两装).
const registry = vi.hoisted(() => ({
    extensions: [] as IExtensionPoint[],
    overviewProvider: undefined as IExtensionPoint | undefined,
}))
vi.mock('../../extensions/registry', () => ({
    get extensions() { return registry.extensions },
    get overviewProvider() { return registry.overviewProvider },
}))

//* 登录态 mock: 侧栏经 useAuth 读用户名渲染头像行, 用例注入 (访客态该值不参与判定, 判定权在 onOpenLogin).
const authUser = vi.hoisted(() => ({ current: null as AuthData | null }))
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({ user: authUser.current, login: vi.fn(), logout: vi.fn() }),
}))

//* 注册表契约要求 page 组件必填, 测试数据给空壳组件即可 (侧栏只消费元信息, 不渲染页面).
const NullPage = (): null => null

const EXTENSIONS: IExtensionPoint[] = [
    { id: 'timetable', name: '课表', icon: 'calendar', page: NullPage },
    { id: 'agenda', name: '日程', icon: 'calendar', page: NullPage },
    { id: 'exams', name: '考试', icon: 'calendar', page: NullPage },  //* P3 转正: 条目全为真实扩展, 无 mock 标注概念.
]
const OVERVIEW_PROVIDER: IExtensionPoint = {
    id: 'timetable', name: '课表', icon: 'calendar', page: NullPage,
    overview: NullPage,  //* 总览提供者 = 注册了 overview 的扩展 (D9 首注册语义).
}

const USER: AuthData = { token: 't', userId: 'u1', username: '小明', role: 'STUDENT' }

//* C1 双裁定用例的 ADMIN 身份样本: 侧栏角色分区 (工作台/扩展治理/设置, 无会话区) 的角色基准.
const ADMIN_USER: AuthData = { token: 't', userId: 'u3', username: '管理员', role: 'ADMIN' }

const SESSIONS: ChatSessionVo[] = [
    { sessionId: 's1', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力' },
    { sessionId: 's2', messageCount: 5, lastUpdateTime: '2026-09-27T09:00:00', preview: '室友关系烦恼' },
]

function baseProps(overrides: Partial<ISidebarProps> = {}): ISidebarProps
{
    return {
        section: 'sessions',
        collapsed: false,
        onSectionChange: vi.fn(),
        onToggleCollapse: vi.fn(),
        extensionsLabel: '扩展',
        menuOpen: false,
        onMenuToggle: vi.fn(),
        onOpenCrisis: vi.fn(),
        ...overrides,
    }
}

function renderSidebar(props: ISidebarProps): ReactElement
{
    return <MemoryRouter><Sidebar {...props} /></MemoryRouter>
}

describe('Sidebar (手风琴侧栏 v2)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()  //* 端点/toast mock 的调用史清零: 接线用例的 toHaveBeenCalledX 顺序无关.
        registry.extensions = EXTENSIONS
        registry.overviewProvider = OVERVIEW_PROVIDER
        authUser.current = null
        //* 会话管理端点默认成功态 (Task 6): 接线用例断言调用与列表更新, 失败用例在用例内覆写.
        vi.mocked(pinSession).mockResolvedValue({ pinnedAt: '2026-10-05T10:00:00' })
        vi.mocked(renameSession).mockResolvedValue(undefined)
    })
    afterEach(() =>
    {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()  //* 手势用例装过小屏 matchMedia 桩, 用例间归还 (缺省桩由 setup.ts 的 beforeEach 重装).
    })

    it('手风琴 (C1 角色分区): 扩展治理节仅 ADMIN 渲染 — ADMIN 点节标题上抛 "extensions"; 非 ADMIN 点会话节标题上抛 "sessions"', async () =>
    {
        const user = userEvent.setup()
        const onSectionChange = vi.fn()
        //* ADMIN: 扩展治理节在场, 会话节整体退场 (C1) — 点节标题上抛由壳导航.
        authUser.current = ADMIN_USER
        const { rerender } = render(renderSidebar(baseProps({ section: 'sessions', onSectionChange })))
        expect(screen.getByRole('button', { name: '扩展治理' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('button', { name: '会话' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '扩展治理' }))
        expect(onSectionChange).toHaveBeenCalledWith('extensions')

        //* 壳翻转 section 后重渲染: 扩展治理节展开, 注册表条目在场.
        rerender(renderSidebar(baseProps({ section: 'extensions', onSectionChange })))
        expect(screen.getByText('课表')).toBeInTheDocument()

        //* 非 ADMIN (STUDENT): 只剩会话节 — 扩展治理节不可见, 点节标题照常上抛.
        authUser.current = USER
        onSectionChange.mockClear()
        rerender(renderSidebar(baseProps({ section: 'sessions', onSectionChange })))
        expect(screen.getByRole('button', { name: '会话' })).toHaveAttribute('aria-expanded', 'true')
        expect(screen.queryByRole('button', { name: '扩展治理' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '会话' }))
        expect(onSectionChange).toHaveBeenCalledWith('sessions')
    })

    it('条目无框: 会话条目走 sidebar-row 纯文本行 (无框线类), 点击上抛 onOpenSession', async () =>
    {
        const user = userEvent.setup()
        const onOpenSession = vi.fn()
        render(renderSidebar(baseProps({ sessions: SESSIONS, onOpenSession })))
        const row = screen.getByText('最近的考试压力').closest('li')
        expect(row).toHaveClass('sidebar-row')
        expect(row?.className).not.toMatch(/border/)
        await user.click(screen.getByText('最近的考试压力'))
        expect(onOpenSession).toHaveBeenCalledWith('s1')
    })

    it('会话行仅标题 (Task 6): 行 = 标题 (.row-title, ellipsis) + 相对时间 (.row-time), 无摘要副行节点; 点击仍上抛 onOpenSession', async () =>
    {
        const user = userEvent.setup()
        const onOpenSession = vi.fn()
        const titled: ChatSessionVo[] = [
            { sessionId: 's1', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力', title: '备考夜谈' },
        ]
        render(renderSidebar(baseProps({ sessions: titled, onOpenSession })))
        expect(screen.getByText('备考夜谈')).toHaveClass('row-title')
        expect(screen.queryByText('最近的考试压力')).not.toBeInTheDocument()  //* 摘要节点退场 (行结构精简).
        expect(screen.getByText('备考夜谈').closest('button')).toHaveClass('sidebar-row-main')
        const time = document.querySelector('.row-time')
        expect(time).not.toBeNull()
        expect(time?.textContent).not.toBe('')  //* 相对时间文案由 relTime 产出 (分支正确性归 relTime.test).
        await user.click(screen.getByText('备考夜谈'))
        expect(onOpenSession).toHaveBeenCalledWith('s1')
    })

    it('存量会话无 title: preview 兜底为行标题身份 (仍在 .row-title 槽位), 时间槽照常', () =>
    {
        render(renderSidebar(baseProps({ sessions: SESSIONS })))
        expect(screen.getByText('最近的考试压力')).toHaveClass('row-title')
        expect(screen.getByText('室友关系烦恼').closest('li')).toHaveClass('sidebar-row')
    })

    it('扩展条目 (C1: 仅 ADMIN): 条目来自注册表 (P3 转正后全为真实扩展, 无 Mock 小字), 总览条目在场', () =>
    {
        authUser.current = ADMIN_USER
        render(renderSidebar(baseProps({ section: 'extensions' })))
        expect(screen.getByText('总览')).toBeInTheDocument()
        for(const name of ['课表', '日程', '考试'])
            expect(screen.getByText(name)).toBeInTheDocument()
        const row = screen.getByText('课表').closest('button')
        expect(row).toHaveClass('sidebar-row')
        expect(screen.queryByText('Mock')).not.toBeInTheDocument()  //* 行尾 Mock 小字随 mocks 目录退役, 不得残留.
    })

    it('总览条目 (C1: 仅 ADMIN): 注册表无总览提供者时整条不渲染 (其余扩展条目照常)', () =>
    {
        authUser.current = ADMIN_USER
        registry.overviewProvider = undefined
        render(renderSidebar(baseProps({ section: 'extensions' })))
        expect(screen.queryByText('总览')).not.toBeInTheDocument()
        expect(screen.getByText('课表')).toBeInTheDocument()
    })

    it('扩展板块命名 (C1 治理语义): ADMIN 节名固定 "扩展治理" (部署配置 extensionsLabel 不再上屏), 非 ADMIN 无此节', () =>
    {
        authUser.current = ADMIN_USER
        render(renderSidebar(baseProps({ extensionsLabel: '成长营' })))
        const title = screen.getByRole('button', { name: '扩展治理' })
        expect(title).toHaveAttribute('aria-expanded', 'false')
        expect(within(title).getByText('扩展治理')).toHaveClass('sidebar-section-name')
        expect(screen.queryByRole('button', { name: '成长营' })).not.toBeInTheDocument()  //* 治理视角不随品牌文案漂移.
    })

    it('折叠态: 宽度 48 仅图标列 (C1: 访客 rail = 会话/新建会话/登录头像, 扩展治理图标仅 ADMIN), aria 齐全, 点节图标展开并切节', async () =>
    {
        const user = userEvent.setup()
        const onSectionChange = vi.fn()
        const onToggleCollapse = vi.fn()
        render(renderSidebar(baseProps({
            collapsed: true, sessions: SESSIONS, onOpenLogin: vi.fn(), onSectionChange, onToggleCollapse,
        })))
        expect(screen.getByRole('complementary')).toHaveStyle({ width: '48px' })
        expect(screen.queryByRole('button', { name: '扩展治理' })).not.toBeInTheDocument()  //* 访客无扩展入口 (C1).
        expect(screen.getByRole('button', { name: '会话' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '新建会话' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()  //* 折叠态可见文本即可访问名 (T6 名实一致整改: 不再有 aria-label 覆写).
        //* 仅图标列: 展开态内容 (会话预览/条目) 一律不渲染.
        expect(screen.queryByText('最近的考试压力')).not.toBeInTheDocument()
        expect(screen.queryByText('总览')).not.toBeInTheDocument()
        //* 点节图标 = 展开侧栏并切到对应节 (双上抛, 壳负责导航).
        await user.click(screen.getByRole('button', { name: '会话' }))
        expect(onSectionChange).toHaveBeenCalledWith('sessions')
        expect(onToggleCollapse).toHaveBeenCalledOnce()
    })

    it('头像行: 访客 = 登录 / 注册 + 汉堡双件套 (危机入口红线); 登录用户 = 头像+用户名+汉堡, 各自上抛', async () =>
    {
        const user = userEvent.setup()
        const onMenuToggle = vi.fn()
        const onOpenLogin = vi.fn()
        const { rerender } = render(renderSidebar(baseProps({ onMenuToggle, onOpenLogin })))
        await user.click(screen.getByRole('button', { name: '登录 / 注册' }))
        expect(onOpenLogin).toHaveBeenCalledOnce()
        //* 访客汉堡照常在场 (T6 评审整改: 危机入口对访客可达), 开合上抛壳.
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(onMenuToggle).toHaveBeenCalledOnce()

        //* 壳在登录后停止下发 onOpenLogin: 头像行切换为 头像+用户名+汉堡.
        authUser.current = USER
        rerender(renderSidebar(baseProps({ onMenuToggle })))
        expect(screen.getByText('小明')).toBeInTheDocument()
        expect(document.querySelector('.sidebar-avatar')).not.toBeNull()
        await user.click(screen.getByRole('button', { name: '打开菜单' }))
        expect(onMenuToggle).toHaveBeenCalledTimes(2)
        expect(screen.queryByRole('button', { name: '登录 / 注册' })).not.toBeInTheDocument()
    })

    it('删除 ×: hover 显隐归 CSS, 点击上抛 onDeleteSession (语义 = 请求删除, 壳级模态确认后才真删, 无 window.confirm)', async () =>
    {
        const user = userEvent.setup()
        const onDeleteSession = vi.fn()
        const confirmSpy = vi.spyOn(window, 'confirm')
        render(renderSidebar(baseProps({ sessions: SESSIONS, onDeleteSession })))
        const del = screen.getByRole('button', { name: '删除会话: 最近的考试压力' })
        expect(del).toHaveClass('sidebar-del')
        await user.click(del)
        expect(onDeleteSession).toHaveBeenCalledWith('s1')
        expect(confirmSpy).not.toHaveBeenCalled()
    })

    it('按压反馈 (Task 5): 会话主行按钮挂 pressable 类 (:active 缩放反馈由 base.css 工具类承载, jsdom 只钉挂点)', () =>
    {
        render(renderSidebar(baseProps({ sessions: SESSIONS })))
        expect(screen.getByText('最近的考试压力').closest('button')).toHaveClass('pressable')
    })

    it('折叠切换: onToggleCollapse 上抛, aria/宽度翻转, 偏好写入 localStorage', async () =>
    {
        const user = userEvent.setup()
        const onToggleCollapse = vi.fn()
        const { rerender } = render(renderSidebar(baseProps({ onToggleCollapse })))
        const rail = screen.getByRole('complementary')
        expect(rail).toHaveStyle({ width: '260px' })
        expect(screen.getByRole('button', { name: '收起侧栏' })).toHaveAttribute('aria-expanded', 'true')
        await user.click(screen.getByRole('button', { name: '收起侧栏' }))
        expect(onToggleCollapse).toHaveBeenCalledOnce()
        expect(localStorage.getItem(SIDEBAR_PREF_KEY)).toBe('collapsed')
        //* 壳翻转 collapsed 后重渲染: 图标条形态生效, 按钮语义同步换向.
        rerender(renderSidebar(baseProps({ collapsed: true, onToggleCollapse })))
        expect(rail).toHaveStyle({ width: '48px' })
        expect(screen.getByRole('button', { name: '展开侧栏' })).toHaveAttribute('aria-expanded', 'false')
        await user.click(screen.getByRole('button', { name: '展开侧栏' }))
        expect(localStorage.getItem(SIDEBAR_PREF_KEY)).toBe('expanded')
    })

    //region 抽屉形态 (Task 15): 全屏化结构契约 + 侧滑手势
    it('抽屉全屏化结构契约: 全屏宽度由 CSS 类覆盖内联宽度, 主体列表区与底部用户行是 aside 直接子节点 (滚动归 body, foot 沉底固定)', () =>
    {
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        const aside = screen.getByRole('complementary')
        expect(aside).toHaveClass('drawer-open')
        //* jsdom 不加载 CSS: width:100% !important 覆盖与 .sidebar-body 的 flex+overflow 滚动链路由 base.css 媒体查询承载,
        //* 这里钉的是让该链路成立的结构前提 — body (可滚区) 与 foot (沉底行) 必须是 aside 的直接子节点, 列表不能滚出抽屉.
        const directClasses = Array.from(aside.children).map(c => c.className)
        expect(directClasses.some(c => c.includes('sidebar-body'))).toBe(true)
        expect(directClasses.some(c => c.includes('sidebar-foot'))).toBe(true)
        expect(document.querySelector('.drawer-overlay')).not.toBeNull()  //* 遮罩是 aside 兄弟节点 (真机 fixed 退化走查结论, 回归钉).
    })

    //* 手势用例的小屏桩: 侧滑手势按 (max-width: 767px) 门禁, 缺省桩恒 false, 手势用例显式装 true 桩 (afterEach 统一归还).
    function stubMobileViewport(): void
    {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }))
    }

    //region 抽屉关闭态汉堡钮 hidden (冒烟走查改进): 移动端抽屉关闭时 aside 整体滑出屏外, 汉堡钮加
    //* DOM 层 hidden 防读屏/键盘误达屏外按钮 (CSS visibility:hidden 有过渡延迟窗口且 jsdom 不生效).
    //* AppShell 无条件下发 drawerOpen/onCloseDrawer, 桌面与移动端关闭态在 props 上不可区分 — 判定源
    //* 只能是 (max-width: 767px) 媒体查询 (同组件 isMobileViewport), 三态契约: 移动关闭态在场 /
    //* 抽屉展开态移除 / 桌面口径不在场 (误藏功能钮是可达性事故, 宁可达勿误藏).
    it('抽屉关闭态 (移动端口径): 汉堡钮带 hidden 属性 (屏外防误达)', () =>
    {
        stubMobileViewport()
        render(renderSidebar(baseProps({ drawerOpen: false, onOpenDrawer: vi.fn(), onCloseDrawer: vi.fn() })))
        expect(document.querySelector('.sidebar-menu')).toHaveAttribute('hidden')
    })

    it('抽屉展开态: 汉堡钮 hidden 移除 (可达)', () =>
    {
        stubMobileViewport()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        expect(document.querySelector('.sidebar-menu')).not.toHaveAttribute('hidden')
    })

    it('桌面口径 (767px 不命中): 汉堡钮 hidden 不在场 (可达)', () =>
    {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }))
        render(renderSidebar(baseProps({})))
        expect(document.querySelector('.sidebar-menu')).not.toHaveAttribute('hidden')
    })
    //endregion

    //* jsdom 无 TouchEvent 构造器: 手工构造带 touches/changedTouches 的冒泡事件派发 — 组件监听的是原生事件,
    //* 只读 changedTouches/touches/timeStamp 三个字段, 与真实 TouchEvent 的消费面一致.
    //* time 缺省沿 jsdom 自动时间戳; 双击用例需可控时钟 (间隔阈值断言), 显式传入毫秒值.
    function fireTouch(target: EventTarget, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y = 100, time?: number): void
    {
        const touch = { identifier: 1, clientX: x, clientY: y } as unknown as Touch
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'touches', { value: [touch] })
        Object.defineProperty(event, 'changedTouches', { value: [touch] })
        if(time != null)
            Object.defineProperty(event, 'timeStamp', { value: time })
        target.dispatchEvent(event)
    }

    it('侧滑手势 (关·提交): 抽屉内起滑跟指位移, 松手超位移阈值回调 onCloseDrawer 并清内联样式', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const aside = screen.getByRole('complementary')
        fireTouch(aside, 'touchstart', 30)  //* 抽屉内起滑 (非会话行区域, 全域可起).
        fireTouch(aside, 'touchmove', -20)  //* dx = -50.
        expect(aside.style.transition).toBe('none')  //* 跟指期脱离令牌过渡.
        expect(aside.style.transform).toBe('translateX(-50px)')  //* 位移直写内联 transform (零重渲染跟指).
        fireTouch(aside, 'touchmove', -34)  //* dx = -64, 达 COMMIT_DISTANCE.
        fireTouch(aside, 'touchend', -34)
        expect(onCloseDrawer).toHaveBeenCalledOnce()
        expect(aside.style.transform).toBe('')  //* 内联清零: 后续滑出动画交回 CSS 类.
    })

    it('侧滑手势 (关·回弹): 位移未达阈值松手不关抽屉, 内联位移清零且状态不变', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const aside = screen.getByRole('complementary')
        fireTouch(aside, 'touchstart', 30)
        fireTouch(aside, 'touchmove', 10)  //* dx = -20, 未达 64.
        fireTouch(aside, 'touchend', 10)
        expect(onCloseDrawer).not.toHaveBeenCalled()
        expect(aside.style.transform).toBe('')  //* 回弹归位 (类规则 translateX(0) 接手).
    })

    it('侧滑手势 (关·全域化, 真机走查整改): 抽屉内任意非行位置左滑可关 — 旧左缘触发带裁撤, 列表深处慢滑跟指直达提交阈值', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const aside = screen.getByRole('complementary')
        fireTouch(aside, 'touchstart', 120)  //* 列表深处起滑 (远超旧 40px 触发带): 全域化后照常起手势.
        fireTouch(aside, 'touchmove', 70)  //* dx = -50: 旧带内起滑可达位移被屏界截断在 40px, 全域化后慢滑可越过.
        expect(aside.style.transition).toBe('none')  //* 跟指期脱离令牌过渡.
        expect(aside.style.transform).toBe('translateX(-50px)')  //* 深处起滑同样跟指 (真机慢滑跟指回归钉).
        fireTouch(aside, 'touchmove', 56)  //* dx = -64, 达 COMMIT_DISTANCE.
        fireTouch(aside, 'touchend', 56)
        expect(onCloseDrawer).toHaveBeenCalledOnce()
        expect(aside.style.transform).toBe('')  //* 内联清零: 后续滑出动画交回 CSS 类.
    })

    it('侧滑手势 (开·提交): 关闭态从屏幕左缘右滑, 预览可见并跟指, 松手超阈值回调 onOpenDrawer', () =>
    {
        stubMobileViewport()
        const onOpenDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: false, onOpenDrawer })))
        const aside = screen.getByRole('complementary')
        fireTouch(document, 'touchstart', 10)  //* 屏幕左缘 24px 触发带内.
        fireTouch(document, 'touchmove', 50)  //* dx = 40.
        expect(aside.style.visibility).toBe('visible')  //! 关闭态 visibility:hidden, 预览必须内联翻回可见.
        expect(aside.style.transform).toBe('translateX(calc(-105% + 40px))')  //* 从屏外泊位起算跟指.
        fireTouch(document, 'touchmove', 84)  //* dx = 84, 达 COMMIT_DISTANCE.
        fireTouch(document, 'touchend', 84)
        expect(onOpenDrawer).toHaveBeenCalledOnce()
        expect(aside.style.transform).toBe('')
        expect(aside.style.visibility).toBe('')
    })

    it('侧滑手势 (开·回弹/带外): 位移不足不打开, 屏幕左缘带外右滑同样不打开', () =>
    {
        stubMobileViewport()
        const onOpenDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: false, onOpenDrawer })))
        fireTouch(document, 'touchstart', 10)
        fireTouch(document, 'touchmove', 30)  //* dx = 30, 未达 64.
        fireTouch(document, 'touchend', 30)
        expect(onOpenDrawer).not.toHaveBeenCalled()
        expect(document.querySelector('.drawer-overlay')).toBeNull()  //* 抽屉仍关闭 (壳态未翻, 遮罩不在场).
        fireTouch(document, 'touchstart', 60)  //* 带外 (24px 之外): 完全不起手势.
        fireTouch(document, 'touchmove', 160)
        fireTouch(document, 'touchend', 160)
        expect(onOpenDrawer).not.toHaveBeenCalled()
    })

    it('侧滑手势 (回调缺席门禁, RED 互斥钉子): 壳不下发 onOpenDrawer 时, 左缘右滑完全不起手势', () =>
    {
        stubMobileViewport()
        render(renderSidebar(baseProps()))  //* 无 onOpenDrawer prop — RED 在屏时壳侧收窄下发面 (AppShell 裁决), 组件门禁必须兜住.
        const aside = screen.getByRole('complementary')
        fireTouch(document, 'touchstart', 10)  //* 屏幕左缘 24px 触发带内.
        fireTouch(document, 'touchmove', 84)
        fireTouch(document, 'touchend', 84)
        expect(aside.style.visibility).toBe('')  //* 预览未翻可见: 手势从未开始.
        expect(aside.style.transform).toBe('')
    })

    it('侧滑手势 (轴锁): 纵向意图让位给列表滚动 — 竖向拖动不产生跟指位移也不关抽屉', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const aside = screen.getByRole('complementary')
        fireTouch(aside, 'touchstart', 20, 200)
        fireTouch(aside, 'touchmove', 16, 260)  //* dx=-4, dy=+60: 纵向显著.
        expect(aside.style.transform).toBe('')  //* 纵向弃置: 撤销跟指.
        fireTouch(aside, 'touchmove', -80, 400)  //* 同一触点再横滑也不复活 (轴锁单向).
        fireTouch(aside, 'touchend', -80, 400)
        expect(onCloseDrawer).not.toHaveBeenCalled()
    })

    it('抽屉头部关闭钮 (R1 走查整改): 全屏抽屉渲染显式 X 关闭钮, 点击上抛 onCloseDrawer', async () =>
    {
        const user = userEvent.setup()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const close = screen.getByRole('button', { name: '关闭菜单' })
        expect(close).toHaveClass('sidebar-close')
        await user.click(close)
        expect(onCloseDrawer).toHaveBeenCalledOnce()
    })

    it('桌面/收起态不渲染抽屉关闭钮: 关抽屉出路不与 "收起侧栏" 折叠钮混淆职责', () =>
    {
        const { rerender } = render(renderSidebar(baseProps({ onCloseDrawer: vi.fn() })))
        expect(screen.queryByRole('button', { name: '关闭菜单' })).not.toBeInTheDocument()
        rerender(renderSidebar(baseProps({ collapsed: true, onCloseDrawer: vi.fn() })))
        expect(screen.queryByRole('button', { name: '关闭菜单' })).not.toBeInTheDocument()
    })
    //endregion

    //region 会话行左滑删除手势 (R2): 抽屉展开态会话行左滑露出行内删除钮, 过提交阈值松手走删除确认流程.
    //* 裁决 (位移口径): 提交阈值与抽屉级 COMMIT_DISTANCE 同为 -64px; 另设更低的停靠阈值 — 过停靠阈值
    //* 松手只停靠露钮 (停靠态保留删除钮, 复位归点击行/删除钮/滚动), 未过停靠阈值原地回弹.
    it('左滑手势 (露钮·停靠两态): 左滑松手过停靠阈值 → 主行停靠 -64px 露出删除钮 (swiped 类), 停靠态点行复位不打开会话', async () =>
    {
        stubMobileViewport()
        const user = userEvent.setup()
        const onOpenSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS, onOpenSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)  //* dx = -30: 过轴锁死区, 锁横轴跟指.
        expect(main.style.transition).toBe('none')  //* 跟指期脱离令牌过渡 (与抽屉级手势同法).
        expect(main.style.transform).toBe('translateX(-30px)')  //* 位移直写内联 transform.
        fireTouch(main, 'touchend', 170, 300)  //* 位移 -30 ∈ [-64, -24]: 停靠而非提交.
        expect(row).toHaveClass('swiped')  //* 停靠态: 类标出露钮 (CSS 侧据此让删除钮可见).
        expect(main.style.transform).toBe('translateX(-64px)')  //* 停靠位 = 满幅露钮.
        expect(main.style.transition).toBe('')  //* 内联过渡归还: 停靠动画交回 CSS 类上的令牌过渡.
        expect(screen.getByRole('button', { name: '删除会话: 最近的考试压力' })).not.toHaveAttribute('tabindex', '-1')  //* 停靠露钮必须可聚焦 (button 本体天然可聚焦, 禁人为 -1).
        //* 锁轴滑动松手后的合成 click: 被抑制 — 不打开会话也不复位停靠 (否则停靠即被自己的 click 撤销).
        fireEvent.click(main)
        expect(onOpenSession).not.toHaveBeenCalled()
        expect(row).toHaveClass('swiped')
        //* 停靠态真实点击主行: 复位回弹 (两态之 "回"), 且不顺带打开会话.
        await user.click(main)
        expect(row).not.toHaveClass('swiped')
        expect(main.style.transform).toBe('')
        expect(onOpenSession).not.toHaveBeenCalled()
    })

    it('左滑手势 (回弹): 未过停靠阈值松手原地回弹, 不停靠不提交; 合成 click 仍被抑制不误开会话', () =>
    {
        stubMobileViewport()
        const onOpenSession = vi.fn()
        const onDeleteSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS, onOpenSession, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 196, 300)  //* dx = -4: 未过轴锁死区, 不起手势.
        expect(main.style.transform).toBe('')
        fireTouch(main, 'touchmove', 185, 300)  //* dx = -15: 锁横轴跟指, 但未过停靠阈值.
        expect(main.style.transform).toBe('translateX(-15px)')
        fireTouch(main, 'touchend', 185, 300)
        expect(row).not.toHaveClass('swiped')  //* 回弹: 不停靠.
        expect(main.style.transform).toBe('')
        expect(onDeleteSession).not.toHaveBeenCalled()  //* 未达提交阈值, 不进删除流程.
        fireEvent.click(main)
        expect(onOpenSession).not.toHaveBeenCalled()  //* 锁轴滑动后的合成 click 抑制.
    })

    it('左滑手势 (提交删除): 滑过 -64px 阈值松手 → 上抛 onDeleteSession (与点删除钮同一确认流程), 行复位不停靠, 合成 click 不二次触发', () =>
    {
        stubMobileViewport()
        const onDeleteSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 130, 300)  //* dx = -70: 过提交阈值.
        fireTouch(main, 'touchend', 130, 300)
        expect(onDeleteSession).toHaveBeenCalledTimes(1)
        expect(onDeleteSession).toHaveBeenCalledWith('s1')  //* 语义 = 请求删除, 壳层 pendingDeleteId 确认后真删 (Task 11 契约).
        expect(row).not.toHaveClass('swiped')  //* 提交即复位: 确认弹层在场时行不再停靠.
        expect(main.style.transform).toBe('')
        fireEvent.click(main)
        expect(onDeleteSession).toHaveBeenCalledTimes(1)  //! 锁轴滑动松手的合成 click 落主行: 被抑制 (一次手势至多吞一次).
        //* 合成 click 落在删除钮的分支 (手指恰好停在钮上): 同样被抑制 — 单独一次手势各自吞自己的那一次.
        const row2 = screen.getByText('室友关系烦恼').closest('li')!
        const main2 = row2.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main2, 'touchstart', 200, 300)
        fireTouch(main2, 'touchmove', 130, 300)
        fireTouch(main2, 'touchend', 130, 300)
        expect(onDeleteSession).toHaveBeenCalledTimes(2)  //* 第二行的提交是独立手势, 照常上抛.
        fireEvent.click(screen.getByRole('button', { name: '删除会话: 室友关系烦恼' }))
        expect(onDeleteSession).toHaveBeenCalledTimes(2)
    })

    it('左滑手势 (纵向让位): 垂直位移先超死区 → 手势弃置让位列表滚动 (不 preventDefault), 同触点再横移不复活也不提交', () =>
    {
        stubMobileViewport()
        const onDeleteSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 202, 360)  //* dx=+2, dy=+60: 纵向显著, 让位滚动.
        expect(main.style.transform).toBe('')
        fireTouch(main, 'touchmove', 120, 360)  //* 同一触点再横滑不复活 (轴锁单向).
        expect(main.style.transform).toBe('')
        fireTouch(main, 'touchend', 120, 360)
        expect(onDeleteSession).not.toHaveBeenCalled()
        expect(row).not.toHaveClass('swiped')
    })

    it('左滑手势 (仲裁, 关手势全域化): 会话行上起滑归行内手势 — 提交删除而非关抽屉; 非行区域起滑归抽屉级关手势', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        const onDeleteSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS, onDeleteSession })))
        const aside = screen.getByRole('complementary')
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        //* 行上起滑 (含旧左缘触发带内的 x=20): 行内手势持有该触摸 — 两手势同向同阈值, 不仲裁则行内
        //* 露钮/删除永远被关抽屉截胡 (全域化裁定: data-session-id 上起滑归行手势).
        fireTouch(main, 'touchstart', 20, 300)
        fireTouch(main, 'touchmove', -50, 300)  //* dx = -70: 行内越提交阈值, 跟指满幅钳取.
        expect(main.style.transform).toBe('translateX(-64px)')  //* 行内跟指照常.
        expect(aside.style.transform).toBe('')  //* 抽屉纹丝不动: 该触摸归行手势.
        fireTouch(main, 'touchend', -50, 300)
        expect(onDeleteSession).toHaveBeenCalledOnce()
        expect(onCloseDrawer).not.toHaveBeenCalled()  //! 同一触摸不得既删行又关抽屉.
        //* 非行区域 (以 aside 本体代靶) 起滑: 抽屉级全域关手势持有, 照常提交.
        fireTouch(aside, 'touchstart', 120)
        fireTouch(aside, 'touchmove', 40)  //* dx = -80: 越提交阈值.
        fireTouch(aside, 'touchend', 40)
        expect(onCloseDrawer).toHaveBeenCalledOnce()
        expect(onDeleteSession).toHaveBeenCalledTimes(1)  //* 第二次触摸与行无关, 不重复触发删除.
    })

    it('左滑手势 (门禁): 非移动端口径或抽屉未开时, 会话行上的横滑完全不起手势', () =>
    {
        const onDeleteSession = vi.fn()
        const { rerender } = render(renderSidebar(baseProps({ drawerOpen: true, sessions: SESSIONS, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)  //* 缺省 matchMedia 桩 = 宽屏: 手势门禁不通过.
        fireTouch(main, 'touchmove', 160, 300)
        fireTouch(main, 'touchend', 160, 300)
        expect(main.style.transform).toBe('')
        expect(onDeleteSession).not.toHaveBeenCalled()
        expect(row).not.toHaveClass('swiped')
        //* 抽屉未开 (关闭态行虽在 DOM 但不可交互): 同样不起手势.
        stubMobileViewport()
        rerender(renderSidebar(baseProps({ drawerOpen: false, sessions: SESSIONS, onDeleteSession })))
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 160, 300)
        fireTouch(main, 'touchend', 160, 300)
        expect(main.style.transform).toBe('')
        expect(onDeleteSession).not.toHaveBeenCalled()
    })

    it('左滑手势 (RED 手势总闸, 收官轮): 壳下发 gesturesLocked (RED 在屏) 时行横滑完全不起手势 — 不跟指不停靠不提交, 停靠残留随总闸翻转复位', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        const onDeleteSession = vi.fn()
        const { rerender } = render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        //* 总闸缺席时先建立停靠态: RED 弹窗恰可在此刻弹出, 停靠露钮不得残留到弹窗散场之后.
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)
        fireTouch(main, 'touchend', 170, 300)
        expect(row).toHaveClass('swiped')
        expect(main.style.transform).toBe('translateX(-64px)')
        //* 壳侧 RED 置位 (AppShell: gesturesLocked={red != null}): prop 翻转重挂手势 effect,
        //* 清理分支必须收走停靠与在途状态 — 弹窗压屏期间侧栏零手势残留.
        rerender(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS, onDeleteSession, gesturesLocked: true })))
        expect(row).not.toHaveClass('swiped')
        expect(main.style.transform).toBe('')
        //* 总闸在屏: 行上完整左滑手势链 (锁轴跟指 + 越过 -64 提交阈值) 起滑即被吞 — 遮罩物理拦截之外的第二道闩.
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 130, 300)  //* dx = -70: 若未锁早该提交删除.
        expect(main.style.transform).toBe('')
        fireTouch(main, 'touchend', 130, 300)
        expect(onDeleteSession).not.toHaveBeenCalled()
        expect(row).not.toHaveClass('swiped')
        //* 总闸语义 = RED 在屏侧栏零手势: 抽屉级全域关手势同冻结.
        const aside = screen.getByRole('complementary')
        fireTouch(aside, 'touchstart', 30)
        fireTouch(aside, 'touchmove', -34)
        fireTouch(aside, 'touchend', -34)
        expect(aside.style.transform).toBe('')
        expect(onCloseDrawer).not.toHaveBeenCalled()
    })

    it('左滑手势 (滚动复位): 列表滚动事件将停靠行复位回弹 — 滚动即视为放弃露钮', () =>
    {
        stubMobileViewport()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)
        fireTouch(main, 'touchend', 170, 300)
        expect(row).toHaveClass('swiped')
        fireEvent.scroll(document.querySelector('.sidebar-body')!)
        expect(row).not.toHaveClass('swiped')  //* 滚动复位.
        expect(main.style.transform).toBe('')
    })

    it('停靠复位 (抽屉重挂钉子, R2 遗留): 停靠后关抽屉再重开, 行已复位 — effect 清理不残留 transform/swiped', () =>
    {
        stubMobileViewport()
        const { rerender } = render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)
        fireTouch(main, 'touchend', 170, 300)
        expect(row).toHaveClass('swiped')
        expect(main.style.transform).toBe('translateX(-64px)')
        //* 关抽屉再重开: 手势 effect 依赖 [drawer, ...] 翻转即注销/重挂, 清理分支 resetAllDockedRows 必须把停靠残留清干净.
        rerender(renderSidebar(baseProps({ drawerOpen: false, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        rerender(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        expect(row).not.toHaveClass('swiped')
        expect(main.style.transform).toBe('')
        expect(main.style.transition).toBe('')  //* 内联过渡也已归还 CSS 类, 无任何手势残留.
    })

    it('停靠互斥 (单行语义): 新行起滑即复位其他停靠行 — 屏上至多一行露钮, 且复位不得波及新行自身的停靠基准', () =>
    {
        stubMobileViewport()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS })))
        const row1 = screen.getByText('最近的考试压力').closest('li')!
        const main1 = row1.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main1, 'touchstart', 200, 300)
        fireTouch(main1, 'touchmove', 170, 300)
        fireTouch(main1, 'touchend', 170, 300)
        expect(row1).toHaveClass('swiped')
        const row2 = screen.getByText('室友关系烦恼').closest('li')!
        const main2 = row2.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main2, 'touchstart', 200, 300)
        fireTouch(main2, 'touchmove', 170, 300)
        fireTouch(main2, 'touchend', 170, 300)
        expect(row2).toHaveClass('swiped')
        expect(main2.style.transform).toBe('translateX(-64px)')  //* 新行照常停靠 (排除自身: 停靠基准以起滑时类态定格).
        expect(row1).not.toHaveClass('swiped')  //* 旧行被新手势复位: 同屏至多一行露删除钮.
        expect(main1.style.transform).toBe('')
    })

    it('停靠基准续算 (R3 顺修钉子): 已停靠行再次起滑以 -64 为基准 — 小幅回拨松手回到 -64 停靠, 左滑越过 -94 松手提交删除', () =>
    {
        //* 裁定 (任务口径对齐): "再左滑 -30 松手回到 -64 停靠" 按实现语义钉在非越线分支 — 从停靠位继续
        //* 左滑必然越过提交阈值 (-64 即停靠位, 任何再左滑 raw 都 < -64), 故 "回停靠" 分支取小幅回拨 (+30,
        //* raw = -34 落在停靠带); "左滑 -30" 分支 (raw = -64-30 = -94) 钉提交删除. 两分支共同钉死:
        //* 起滑基准取停靠态类 (swiped -> base=-64) 而非归零 — 基准若归零, 回拨期间跟指位移会被钳到 0
        //* (无 transform), -30 的左滑也只会回弹而非提交删除.
        stubMobileViewport()
        const onDeleteSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        //* 先建立停靠态 (露钮满幅 -64).
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)
        fireTouch(main, 'touchend', 170, 300)
        expect(row).toHaveClass('swiped')
        expect(main.style.transform).toBe('translateX(-64px)')
        //* 已停靠行再次起滑, 回拨 +30: 跟指位移 = -64+30 = -34 (基准续算的直接证据 — 基准归零则位移钳 0 无 transform).
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 230, 300)
        expect(main.style.transform).toBe('translateX(-34px)')
        fireTouch(main, 'touchend', 230, 300)  //* raw = -34 ∈ [-64, -24]: 停靠带内, 回到 -64 停靠而非提交.
        expect(main.style.transform).toBe('translateX(-64px)')
        expect(row).toHaveClass('swiped')
        expect(onDeleteSession).not.toHaveBeenCalled()
        //* 同一停靠行再起滑左滑 -30: raw = -64-30 = -94 越过提交阈值 → 提交删除 (基准归零则 -30 只会回弹).
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)
        fireTouch(main, 'touchend', 170, 300)
        expect(onDeleteSession).toHaveBeenCalledTimes(1)
        expect(onDeleteSession).toHaveBeenCalledWith('s1')
        expect(row).not.toHaveClass('swiped')  //* 提交即复位: 行不停靠.
        expect(main.style.transform).toBe('')
    })

    it('停靠态点删除钮: 上抛 onDeleteSession (与直接点 × 同路) 且行复位, 删除钮无 tabindex=-1 (台账: 停靠露钮可聚焦)', async () =>
    {
        stubMobileViewport()
        const user = userEvent.setup()
        const onDeleteSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer: vi.fn(), sessions: SESSIONS, onDeleteSession })))
        const row = screen.getByText('最近的考试压力').closest('li')!
        const main = row.querySelector('.sidebar-row-main') as HTMLElement
        fireTouch(main, 'touchstart', 200, 300)
        fireTouch(main, 'touchmove', 170, 300)
        fireTouch(main, 'touchend', 170, 300)
        expect(row).toHaveClass('swiped')
        const del = screen.getByRole('button', { name: '删除会话: 最近的考试压力' })
        expect(del.getAttribute('tabindex')).not.toBe('-1')  //* 台账顺修核查: button 本体可聚焦, 无人为 -1.
        //* 真实点击的触摸前相 (touchstart 作废滑动遗留的抑制旗 + touchend 轻点不锁轴): 随后的 click 必须可达.
        fireTouch(del, 'touchstart', 240, 300)
        fireTouch(del, 'touchend', 240, 300)
        await user.click(del)
        expect(onDeleteSession).toHaveBeenCalledWith('s1')
        expect(row).not.toHaveClass('swiped')  //* 点删除钮即复位露钮 (删除确认流程与停靠态解耦).
        expect(main.style.transform).toBe('')
    })
    //endregion

    //region 双击关抽屉 (真机走查改进): aside 空白区双击 (两次轻点间隔 <300ms, 各自位移与相互落点都小) 关抽屉;
    //* 与行/按钮点击互斥 — 交互元素 (button/a/[data-session-id]) 上的双击语义归元素自身, 不参与关抽屉累计.
    it('双击空白关抽屉: 非交互区域两次轻点, 间隔与落点均在容差内 → 上抛 onCloseDrawer (单击不关)', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const body = document.querySelector('.sidebar-body')!
        fireTouch(body, 'touchstart', 150, 300, 1000)
        fireTouch(body, 'touchend', 154, 304, 1050)  //* 单击内位移 ~5.7px: 轻点成色.
        expect(onCloseDrawer).not.toHaveBeenCalled()  //* 首击不关.
        fireTouch(body, 'touchstart', 152, 302, 1150)
        fireTouch(body, 'touchend', 152, 302, 1200)  //* 距首击 150ms < 300, 落点相近: 双击成立.
        expect(onCloseDrawer).toHaveBeenCalledOnce()
    })

    it('双击行不关抽屉 (互斥): 会话主行是 button/[data-session-id], 其上双击不参与关抽屉累计', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        const onOpenSession = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS, onOpenSession })))
        const main = screen.getByText('最近的考试压力')  //* 主行 button: 双击语义归会话打开, 不归抽屉.
        fireTouch(main, 'touchstart', 150, 300, 1000)
        fireTouch(main, 'touchend', 150, 300, 1050)
        fireTouch(main, 'touchstart', 150, 300, 1150)
        fireTouch(main, 'touchend', 150, 300, 1200)
        expect(onCloseDrawer).not.toHaveBeenCalled()
        expect(onOpenSession).not.toHaveBeenCalled()  //* 轻点未锁轴: 触摸语义交还 click, 不误触打开.
    })

    it('双击间隔过宽不关抽屉: 两次轻点间隔 >=300ms 按两次独立点按处理', () =>
    {
        stubMobileViewport()
        const onCloseDrawer = vi.fn()
        render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: SESSIONS })))
        const body = document.querySelector('.sidebar-body')!
        fireTouch(body, 'touchstart', 150, 300, 1000)
        fireTouch(body, 'touchend', 150, 300, 1050)
        fireTouch(body, 'touchstart', 150, 300, 1400)
        fireTouch(body, 'touchend', 150, 300, 1450)  //* 距首击终点 400ms >= 300: 不构成双击.
        expect(onCloseDrawer).not.toHaveBeenCalled()
    })
    //endregion

    //region Task 6: 行重构 (仅标题+时间) / 置顶分组 / 右键与长按菜单 / 重命名 / FLIP 置顶
    const PINNED_SESSIONS: ChatSessionVo[] = [
        { sessionId: 's1', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力', title: '备考夜谈' },
        { sessionId: 's2', messageCount: 5, lastUpdateTime: '2026-09-27T09:00:00', preview: '室友关系烦恼', title: '室友夜话', pinnedAt: '2026-10-01T08:00:00' },
    ]

    function findRow(id: string): HTMLElement
    {
        return document.querySelector(`[data-session-id="${id}"]`)!
    }

    //* 冲刷 pinSession/renameSession 的 Promise 链 (setState 落在 act 内零警告): 与 App.test 的 settle 同形.
    async function flush(): Promise<void>
    {
        await act(async () =>
        {
            for(let i = 0; i < 5; i++)
                await Promise.resolve()
        })
    }

    it('置顶分组 (Task 6): pinnedAt 非空独立 "置顶" 节且排在前, 未置顶列表在后, 各节内相对顺序稳定', () =>
    {
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        const label = screen.getByText('置顶')
        expect(label).toHaveClass('sidebar-pinned-label')
        const pinnedList = label.nextElementSibling as HTMLElement
        expect(pinnedList).toHaveClass('sidebar-list', 'sidebar-pinned-list')
        expect(pinnedList.querySelector('[data-session-id="s2"]')).not.toBeNull()
        expect(within(pinnedList).queryByText('备考夜谈')).not.toBeInTheDocument()  //* s1 未置顶不得混入.
        const restLists = document.querySelectorAll('.sidebar-list:not(.sidebar-pinned-list)')
        expect(restLists).toHaveLength(1)
        expect(restLists[0].querySelector('[data-session-id="s1"]')).not.toBeNull()
    })

    it('全部置顶: 未置顶列表不渲染, 空态文案不出场 (置顶节在场即列表非空)', () =>
    {
        render(renderSidebar(baseProps({ sessions: [PINNED_SESSIONS[1]] })))
        expect(document.querySelectorAll('.sidebar-list')).toHaveLength(1)
        expect(screen.queryByText('还没有会话, 想聊的时候随时开始.')).not.toBeInTheDocument()
    })

    it('右键呼出菜单: contextmenu preventDefault + 会话菜单在场 (固定弹出), Escape 关闭', () =>
    {
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        //* createEvent 直造事件再派发: fireEvent 的返回值是布尔而非事件对象, defaultPrevented 要从事件本体读.
        const event = createEvent.contextMenu(findRow('s1'))
        fireEvent(findRow('s1'), event)
        expect(event.defaultPrevented).toBe(true)  //* 掐掉浏览器原生右键菜单.
        expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: '置顶' })).toBeInTheDocument()  //* s1 未置顶: 动态文案为置顶.
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('已置顶行右键: 首项动态文案翻转为 "取消置顶" (pinnedAt 驱动)', () =>
    {
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s2'))
        expect(screen.getByRole('menuitem', { name: '取消置顶' })).toBeInTheDocument()
    })

    it('遮罩点击关闭菜单且不上抛任何动作', () =>
    {
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s1'))
        fireEvent.click(document.querySelector('.session-menu-mask')!)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        expect(vi.mocked(pinSession)).not.toHaveBeenCalled()
    })

    it('置顶接线 (API mock): 菜单点置顶 → pinSession(id) 调用 → 列表更新 (行进入置顶节)', async () =>
    {
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s1'))
        fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }))
        expect(vi.mocked(pinSession)).toHaveBeenCalledWith('s1')
        await flush()
        expect(findRow('s1').closest('.sidebar-pinned-list')).not.toBeNull()  //* 服务端翻转态落定: 行入置顶节.
    })

    it('取消置顶接线: pinSession 返回 null → 行退出置顶节回到普通列表 (前端以响应为准)', async () =>
    {
        vi.mocked(pinSession).mockResolvedValue({ pinnedAt: null })
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s2'))
        fireEvent.click(screen.getByRole('menuitem', { name: '取消置顶' }))
        expect(vi.mocked(pinSession)).toHaveBeenCalledWith('s2')
        await flush()
        expect(findRow('s2').closest('.sidebar-pinned-list')).toBeNull()
    })

    it('置顶失败: pinSession reject → toast 错误提示且列表原样 (可重试)', async () =>
    {
        vi.mocked(pinSession).mockRejectedValueOnce(new Error('network'))
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s1'))
        fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }))
        await flush()
        expect(toast).toHaveBeenCalledWith('置顶失败, 请稍后再试.', 'error')
        expect(findRow('s1').closest('.sidebar-pinned-list')).toBeNull()  //* 列表原样.
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()  //* 菜单已关 (动作即关, 失败提示走 toast).
    })

    it('重命名接线 (API mock): 菜单重命名 → 弹层回灌标题 → 保存 → renameSession(id, trimmed) → 行标题更新', async () =>
    {
        const user = userEvent.setup()
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s1'))
        await user.click(screen.getByRole('menuitem', { name: '重命名' }))
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()  //* 菜单先关, 弹层换场 (互斥不同屏).
        const dlg = screen.getByRole('dialog', { name: '重命名会话' })
        const input = within(dlg).getByRole('textbox', { name: '会话标题' }) as HTMLInputElement
        expect(input.value).toBe('备考夜谈')
        await user.clear(input)
        await user.type(input, '  备考新篇  ')
        await user.click(within(dlg).getByRole('button', { name: '保存' }))
        expect(vi.mocked(renameSession)).toHaveBeenCalledWith('s1', '备考新篇')  //* trimmed 后入库.
        await flush()
        expect(screen.getByText('备考新篇')).toHaveClass('row-title')  //* 行标题乐观更新.
        expect(screen.queryByRole('dialog', { name: '重命名会话' })).not.toBeInTheDocument()
    })

    it('重命名失败: renameSession reject → toast 错误提示, 行标题保持原值', async () =>
    {
        vi.mocked(renameSession).mockRejectedValueOnce(new Error('network'))
        const user = userEvent.setup()
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        fireEvent.contextMenu(findRow('s1'))
        await user.click(screen.getByRole('menuitem', { name: '重命名' }))
        await user.click(screen.getByRole('button', { name: '保存' }))
        await flush()
        expect(toast).toHaveBeenCalledWith('重命名失败, 请稍后再试.', 'error')
        expect(screen.getByText('备考夜谈')).toHaveClass('row-title')  //* 原标题保持.
        expect(screen.queryByRole('dialog', { name: '重命名会话' })).not.toBeInTheDocument()  //* 弹层提交即关.
    })

    //* 长按触感桩: navigator.vibrate 在 jsdom 缺席, 定义可配置 own property 桩接住调用 (用例末删除归还).
    function stubVibrate(): ReturnType<typeof vi.fn>
    {
        const vibrate = vi.fn()
        Object.defineProperty(window.navigator, 'vibrate', { value: vibrate, configurable: true })
        return vibrate
    }

    it('长按 500ms 呼出菜单 (触屏): 到时触发 navigator.vibrate(20) 兜底触感 + 菜单在场 (fake timers)', () =>
    {
        const vibrate = stubVibrate()
        vi.useFakeTimers()
        try
        {
            render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
            const main = findRow('s1').querySelector('.sidebar-row-main') as HTMLElement
            fireTouch(main, 'touchstart', 100, 200)
            act(() => { vi.advanceTimersByTime(499) })
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()  //* 未到时长不呼出.
            act(() => { vi.advanceTimersByTime(1) })  //* act 包裹: 定时回调里的 setMenu 需在 act 内冲刷落 DOM.
            expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
            expect(vibrate).toHaveBeenCalledTimes(1)
            expect(vibrate).toHaveBeenCalledWith(20)
        }
        finally
        {
            vi.useRealTimers()
            Reflect.deleteProperty(window.navigator, 'vibrate')
        }
    })

    it('长按取消: touchmove 超出 10px 死区即弃置, touchend 提前松手取消 — 菜单不得呼出不误震', () =>
    {
        const vibrate = stubVibrate()
        vi.useFakeTimers()
        try
        {
            render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
            const main = findRow('s1').querySelector('.sidebar-row-main') as HTMLElement
            fireTouch(main, 'touchstart', 100, 200)
            fireTouch(main, 'touchmove', 112, 204)  //* dx = 12 > 10: 滑动意图, 计时作废.
            vi.advanceTimersByTime(1000)
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()
            expect(vibrate).not.toHaveBeenCalled()
            fireTouch(main, 'touchstart', 100, 200)
            fireTouch(main, 'touchend', 100, 200)  //* 提前松手: 轻点语义, 计时作废.
            vi.advanceTimersByTime(1000)
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()
            expect(vibrate).not.toHaveBeenCalled()
        }
        finally
        {
            vi.useRealTimers()
            Reflect.deleteProperty(window.navigator, 'vibrate')
        }
    })

    it('长按手势总闸 (RED 在屏): 壳下发 gesturesLocked 时长按完全不起势 — 菜单不呼出不误震', () =>
    {
        const vibrate = stubVibrate()
        vi.useFakeTimers()
        try
        {
            render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS, gesturesLocked: true })))
            const main = findRow('s1').querySelector('.sidebar-row-main') as HTMLElement
            fireTouch(main, 'touchstart', 100, 200)
            vi.advanceTimersByTime(1000)
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()
            expect(vibrate).not.toHaveBeenCalled()
        }
        finally
        {
            vi.useRealTimers()
            Reflect.deleteProperty(window.navigator, 'vibrate')
        }
    })

    it('长按触发的合成 click 不误开会话 (I2): 菜单在屏松手, 紧随的 click 被抑制旗吞一次, 旗焚后真实点击照常打开', () =>
    {
        const vibrate = stubVibrate()
        const onOpenSession = vi.fn()
        vi.useFakeTimers()
        try
        {
            render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS, onOpenSession })))
            const main = findRow('s1').querySelector('.sidebar-row-main') as HTMLElement
            fireTouch(main, 'touchstart', 100, 200)
            act(() => { vi.advanceTimersByTime(500) })  //* 长按成局: 菜单在屏, 抑制旗已置位.
            expect(vibrate).toHaveBeenCalledTimes(1)  //* 触感已发 = 长按成局的直接证据.
            expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
            fireTouch(main, 'touchend', 100, 200)
            fireEvent.click(main)  //* 长按松手随附的合成 click: 被旗吞, 不误开会话也不关菜单.
            expect(onOpenSession).not.toHaveBeenCalled()
            expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
            fireEvent.click(main)  //* 旗用后即焚: 紧随的第二次真实点击照常打开会话.
            expect(onOpenSession).toHaveBeenCalledWith('s1')
        }
        finally
        {
            vi.useRealTimers()
            Reflect.deleteProperty(window.navigator, 'vibrate')
        }
    })

    it('长按成局后在途行手势作废 (M3): 抽屉态长按弹出菜单后原地继续左滑 — 不跟指不停靠不提交删除, 菜单不受扰动', () =>
    {
        const vibrate = stubVibrate()
        const onDeleteSession = vi.fn()
        const onCloseDrawer = vi.fn()
        stubMobileViewport()
        vi.useFakeTimers()
        try
        {
            render(renderSidebar(baseProps({ drawerOpen: true, onCloseDrawer, sessions: PINNED_SESSIONS, onDeleteSession })))
            const main = findRow('s1').querySelector('.sidebar-row-main') as HTMLElement
            fireTouch(main, 'touchstart', 200, 300)  //* 行内左滑手势起势 (rowTrack 登记, 轴未锁).
            act(() => { vi.advanceTimersByTime(500) })  //* 原地按住 500ms: 长按成局, 在途 rowTrack 随之作废.
            expect(vibrate).toHaveBeenCalledTimes(1)  //* 触感已发 = 长按成局的直接证据.
            expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
            fireTouch(main, 'touchmove', 130, 300)  //* dx = -70: 若未作废, 跟指满幅且松手必提交删除.
            expect(main.style.transform).toBe('')  //* 不跟指.
            fireTouch(main, 'touchend', 130, 300)
            expect(onDeleteSession).not.toHaveBeenCalled()  //! 菜单在屏期不得提交删除.
            expect(onCloseDrawer).not.toHaveBeenCalled()  //* 同触摸也不得串到抽屉级关手势.
            expect(findRow('s1').classList.contains('swiped')).toBe(false)  //* 无停靠残留, 行保持原位.
            expect(screen.getByRole('menu', { name: '会话菜单' })).toBeInTheDocument()
        }
        finally
        {
            vi.useRealTimers()
            Reflect.deleteProperty(window.navigator, 'vibrate')
        }
    })

    it('菜单定位双向钳取 (M2): 行贴近视口底部时菜单按估高上移 (向上弹), 横向右缘贴齐触发行', () =>
    {
        render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
        const row = findRow('s1')
        vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 730, left: 0, right: 200, width: 200, height: 30, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
        fireEvent.contextMenu(row)
        const menu = screen.getByRole('menu', { name: '会话菜单' })
        expect(menu.style.top).toBe('630px')  //* min(700, 768-130-8) = 630: 低于行顶 700 → 底部空间不足, 菜单向上弹.
        expect(menu.style.left).toBe('52px')  //* max(8, min(200-148, 1024-148-8)) = 52: 右缘贴齐行右缘.
    })

    it('FLIP 置顶 (Task 5 预留类接线): pin 成功行先内联反向偏移, fake rAF 一帧挂 .flip-lift 归位, 兜底窗口后摘类', async () =>
    {
        vi.useFakeTimers()  //* 先伪化定时器: useFakeTimers 连 rAF 一并接管, rAF 桩必须装在其后才会被组件调到.
        const rafQueue: FrameRequestCallback[] = []
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => { rafQueue.push(cb); return rafQueue.length })
        //* I1 评审探针: 记录每次 rect 读取时目标行的内联 transform — Invert 写入 transform 之后必须存在一次
        //! rect 读取 (强制 reflow), 否则两次写入被浏览器合并, transition 永不触发 (jsdom 无布局, 只能钉写入顺序).
        const rectReads: string[] = []
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement)
        {
            rectReads.push(`${this.dataset.sessionId ?? '-'}@${this.style.transform}`)
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
        })
        try
        {
            render(renderSidebar(baseProps({ sessions: PINNED_SESSIONS })))
            fireEvent.contextMenu(findRow('s1'))
            fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }))
            await flush()
            const row = findRow('s1')
            expect(row.closest('.sidebar-pinned-list')).not.toBeNull()  //* Last: 列表已重排.
            expect(row.style.transition).toBe('none')  //* Invert: 反向偏移期脱离令牌过渡.
            expect(row.style.transform).toBe('translateY(0px)')  //* jsdom rect 全 0 → 偏移 0 (浏览器侧为真实行距).
            expect(rectReads).toContain('s1@translateY(0px)')  //* I1: transform 写入之后存在 rect 读取 = reflow 在场 (真实浏览器 transition 触发前提).
            for(const cb of rafQueue.splice(0))
                cb(16)  //* fake rAF 一帧: Play — 归位 + 挂 .flip-lift (Task 5 预留类供过渡节奏).
            expect(row).toHaveClass('flip-lift')
            expect(row.style.transform).toBe('')
            expect(row.style.transition).toBe('')
            vi.advanceTimersByTime(260)  //* 兜底窗口 (--dur-enter 220ms 之上) 走完摘类 (transitionend 在 jsdom 不触发).
            expect(row).not.toHaveClass('flip-lift')
        }
        finally
        {
            vi.useRealTimers()
            vi.unstubAllGlobals()  //* 归还 rAF 桩.
        }
    })
    //endregion

    //region 工作台入口 (角色门禁): 仅 COUNSELOR/ADMIN 渲染, 访客/STUDENT 不可见 — 入口点击导航 /workbench
    it('工作台入口角色门禁: 访客/STUDENT 不渲染, COUNSELOR/ADMIN 渲染, 点击导航 /workbench', async () =>
    {
        //* 路由探针: MemoryRouter 内消费 useLocation, 点入口后断言 pathname 真的到了 /workbench.
        //* 赋值收进 effect (渲染期写外部变量会被 React Compiler 规则拦截), userEvent 的 act 已冲刷 effect.
        let lastPath = ''
        const PathProbe = (): null =>
        {
            const location = useLocation()
            useEffect(() => { lastPath = location.pathname }, [location])
            return null
        }
        const renderProbed = (props: ISidebarProps): ReactElement =>
            <MemoryRouter><Sidebar {...props} /><PathProbe /></MemoryRouter>

        const user = userEvent.setup()
        const { rerender } = render(renderProbed(baseProps()))
        expect(screen.queryByRole('button', { name: '工作台' })).not.toBeInTheDocument()  //* 访客不可见.

        authUser.current = { token: 't', userId: 'u1', username: '学生甲', role: 'STUDENT' }
        rerender(renderProbed(baseProps()))
        expect(screen.queryByRole('button', { name: '工作台' })).not.toBeInTheDocument()  //* 学生反例不可见.

        authUser.current = { token: 't', userId: 'u2', username: '咨询员甲', role: 'COUNSELOR' }
        rerender(renderProbed(baseProps()))
        await user.click(screen.getByRole('button', { name: '工作台' }))
        expect(lastPath).toBe('/workbench')  //* 入口在场且真的导航到工作台.

        authUser.current = { token: 't', userId: 'u3', username: '管理员', role: 'ADMIN' }
        rerender(renderProbed(baseProps()))
        expect(screen.getByRole('button', { name: '工作台' })).toBeInTheDocument()  //* 管理员同权.
    })
    //endregion

    //region C1 ADMIN 双裁定 — 侧栏分区随角色: ADMIN 无会话区 (工作台/扩展治理/设置), 非 ADMIN 无扩展入口
    //* 路由探针 (与工作台入口用例同形, 命名错开防遮蔽): MemoryRouter 内消费 useLocation 钉住导航去向.
    let probedPath = ''
    const C1PathProbe = (): null =>
    {
        const location = useLocation()
        useEffect(() => { probedPath = location.pathname }, [location])
        return null
    }
    const renderWithProbe = (props: ISidebarProps): ReactElement =>
        <MemoryRouter><Sidebar {...props} /><C1PathProbe /></MemoryRouter>

    it('C1 分区 (ADMIN 展开态): 会话区整体退场 (sessions prop 在场也不渲染行), 工作台/扩展治理/设置 三入口在场, 点设置导航 /settings', async () =>
    {
        authUser.current = ADMIN_USER
        probedPath = ''  //* 探针跨用例复位: 只认本用例自己触发的导航.
        const user = userEvent.setup()
        render(renderWithProbe(baseProps({ sessions: SESSIONS })))
        expect(screen.queryByRole('button', { name: '会话' })).not.toBeInTheDocument()  //* 节标题退场.
        expect(screen.queryByRole('button', { name: '新建会话' })).not.toBeInTheDocument()
        expect(screen.queryByText('最近的考试压力')).not.toBeInTheDocument()  //* 会话行不渲染 (数据下发面照旧, 渲染面同闭).
        expect(screen.getByRole('button', { name: '工作台' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '扩展治理' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '设置' }))
        expect(probedPath).toBe('/settings')  //* ADMIN 无会话区后的设置直达出路 (与汉堡菜单设置项同去向).
    })

    it('C1 分区 (ADMIN 折叠态): rail 仅 工作台/扩展治理/设置 三图标钮, 无会话/新建会话', () =>
    {
        authUser.current = ADMIN_USER
        render(renderSidebar(baseProps({ collapsed: true, sessions: SESSIONS })))
        for(const name of ['工作台', '扩展治理', '设置'])
            expect(screen.getByRole('button', { name })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '会话' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '新建会话' })).not.toBeInTheDocument()
    })

    it('C1 分区 (非 ADMIN 反例): 访客/STUDENT/COUNSELOR 均不可见扩展治理入口 (展开节标题与折叠 rail 同闭), 会话区维持现状', () =>
    {
        const { rerender } = render(renderSidebar(baseProps()))  //* 访客: 无扩展入口, 会话节照常.
        expect(screen.queryByRole('button', { name: '扩展治理' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '会话' })).toBeInTheDocument()

        authUser.current = USER  //* STUDENT 反例.
        rerender(renderSidebar(baseProps()))
        expect(screen.queryByRole('button', { name: '扩展治理' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '会话' })).toBeInTheDocument()

        authUser.current = { token: 't', userId: 'u2', username: '咨询员甲', role: 'COUNSELOR' }
        rerender(renderSidebar(baseProps({ collapsed: true })))
        expect(screen.queryByRole('button', { name: '扩展治理' })).not.toBeInTheDocument()  //* 折叠 rail 同闭.
        expect(screen.getByRole('button', { name: '工作台' })).toBeInTheDocument()  //* 咨询员工作台入口维持.
        expect(screen.getByRole('button', { name: '会话' })).toBeInTheDocument()
    })
    //endregion
})
