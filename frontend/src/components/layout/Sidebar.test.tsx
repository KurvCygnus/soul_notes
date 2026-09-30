//* 手风琴侧栏测试 (v2 重写): 节标题上抛 / 条目无框 / 扩展条目经注册表 / 总览条件渲染 / 折叠图标列 / 头像行双态 / 删除直上抛.
//* 契约与旧版一致: 壳仅对访客传 onOpenLogin, 该 prop 在场即访客态; 登录态的用户名经 useAuth 注入 (新契约无 user prop).
//* 扩展条目数据来自 extensions/registry — vi.mock 以 getter 形态暴露, 用例间可变装注册表 (总览有/无两装).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import Sidebar, { SIDEBAR_PREF_KEY } from './Sidebar'
import type { ISidebarProps } from './Sidebar'
import type { IExtensionPoint } from '../../extensions/types'
import type { AuthData, ChatSessionVo } from '../../types'

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
    { id: 'mock-timetable', name: '课表', icon: 'calendar', mock: true, page: NullPage },
    { id: 'mock-agenda', name: '日程', icon: 'calendar', mock: true, page: NullPage },
    { id: 'real-ext', name: '真实扩展', icon: 'pen', page: NullPage },  //* 无 mock 标注: 行尾不得出现 Mock 小字.
]
const OVERVIEW_PROVIDER: IExtensionPoint = {
    id: 'mock-timetable', name: '课表', icon: 'calendar', mock: true, page: NullPage,
    overview: NullPage,  //* 总览提供者 = 注册了 overview 的扩展 (D9 首注册语义).
}

const USER: AuthData = { token: 't', userId: 'u1', username: '小明', role: 'STUDENT' }

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
        registry.extensions = EXTENSIONS
        registry.overviewProvider = OVERVIEW_PROVIDER
        authUser.current = null
    })
    afterEach(() => vi.restoreAllMocks())

    it('手风琴: 点扩展节标题上抛 onSectionChange("extensions"), 点会话节标题上抛 "sessions", 两节内容互斥', async () =>
    {
        const user = userEvent.setup()
        const onSectionChange = vi.fn()
        const { rerender } = render(renderSidebar(baseProps({ section: 'sessions', onSectionChange })))
        //* 手风琴语义: aria-expanded 标出当前展开节; 会话节在场时扩展条目不得渲染 (互斥且必有一个展开).
        expect(screen.getByRole('button', { name: '扩展' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('button', { name: '会话' })).toHaveAttribute('aria-expanded', 'true')
        expect(screen.queryByText('课表')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: '扩展' }))
        expect(onSectionChange).toHaveBeenCalledWith('extensions')

        //* 壳翻转 section 后重渲染: 扩展节展开, 会话条目随之退场.
        rerender(renderSidebar(baseProps({ section: 'extensions', onSectionChange })))
        expect(screen.queryByText('最近的考试压力')).not.toBeInTheDocument()
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

    it('扩展条目: 条目来自注册表, Mock 项行尾 Mock 小字 (非徽标), 总览条目在场', () =>
    {
        render(renderSidebar(baseProps({ section: 'extensions' })))
        expect(screen.getByText('总览')).toBeInTheDocument()
        for(const name of ['课表', '日程', '真实扩展'])
            expect(screen.getByText(name)).toBeInTheDocument()
        const mockRow = screen.getByText('课表').closest('button')
        expect(mockRow).toHaveClass('sidebar-row')
        expect(within(mockRow!).getByText('Mock')).toBeInTheDocument()
        const realRow = screen.getByText('真实扩展').closest('button')
        expect(within(realRow!).queryByText('Mock')).not.toBeInTheDocument()
        expect(screen.getAllByText('Mock')).toHaveLength(2)
    })

    it('总览条目: 注册表无总览提供者时整条不渲染 (其余扩展条目照常)', () =>
    {
        registry.overviewProvider = undefined
        render(renderSidebar(baseProps({ section: 'extensions' })))
        expect(screen.queryByText('总览')).not.toBeInTheDocument()
        expect(screen.getByText('课表')).toBeInTheDocument()
    })

    it('折叠态: 宽度 48 仅图标列 (扩展/会话/新建会话/登录头像), aria-label 齐全, 点节图标展开并切节', async () =>
    {
        const user = userEvent.setup()
        const onSectionChange = vi.fn()
        const onToggleCollapse = vi.fn()
        render(renderSidebar(baseProps({
            collapsed: true, sessions: SESSIONS, onOpenLogin: vi.fn(), onSectionChange, onToggleCollapse,
        })))
        expect(screen.getByRole('complementary')).toHaveStyle({ width: '48px' })
        expect(screen.getByRole('button', { name: '扩展' })).toBeInTheDocument()
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
})
