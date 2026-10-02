//* 左栏 (v2 手风琴): 折叠 (48px 图标条) <-> 展开 (260px 内容区), 宽度数值来自产品规格, 颜色走设计令牌 (.sidebar 类).
//* 结构照 spec §5.1/§5.2: 折叠钮 / 扩展节 (总览 + 注册表条目) / 会话节 (新建会话 + 条目列表) / 底部头像行.
//* 手风琴语义: section 由壳持有 (单一状态, 两节互斥且必有一个展开), 点节标题上抛 onSectionChange 由壳导航
//* sectionRoute; 扩展/总览条目点击由本组件直接导航 — 契约无 onOpenExtension(id), 条目级去向归侧栏, 节级归壳.
//* 访客判定沿旧约: 壳仅对访客传 onOpenLogin, 该 prop 在场即访客态; 侧栏结构照常渲染, 交互上抛壳过登录门.
//* 登录用户的用户名经 useAuth 读取 (契约无 user prop); 删除 × 点击直接上抛 onDeleteSession
//* (语义 = 用户请求删除, 非直接删除 — 二次确认模态归壳 [[ConfirmModal]], Task 11).
//* onOpenCrisis 仍由壳承接: 菜单实体在壳 ([[UserMenu]]), 侧栏汉堡钮 (访客/登录用户两态都在场) 只作开合与 aria 镜像.
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactElement } from 'react'
import Icon from '../ui/Icon'
import { extensions, overviewProvider } from '../../extensions/registry'
import { sectionRoute } from '../../utils/sidebarSections'
import { useAuth } from '../../hooks/useAuth'
import type { SidebarSection } from '../../utils/sidebarSections'
import type { ChatSessionVo } from '../../types'

//* 偏好键与取值归本组件所有, 壳只经它读初始形态 (AppShell 惰性还原).
export const SIDEBAR_PREF_KEY = 'soul.sidebar'

const WIDTH_COLLAPSED = 48
const WIDTH_EXPANDED = 260

export interface ISidebarProps
{
    section: SidebarSection  //* 当前展开节 (单一状态, 手风琴语义)
    collapsed: boolean
    onSectionChange(section: SidebarSection): void  //* 点节标题 -> 壳导航到 sectionRoute(section)
    onToggleCollapse(): void
    extensionsLabel: string  //* 板块显示名 (部署配置, 壳经 useBrandName 下发, 后端缺省兜底 "扩展")
    sessions?: ChatSessionVo[]
    onDeleteSession?(id: string): void
    onOpenSession?(id: string): void
    onNewChat?(): void
    menuOpen: boolean  //* 汉堡菜单开合态 (菜单实体在壳, Task 6), 仅作 aria 状态镜像
    onMenuToggle(): void
    onOpenCrisis(): void  //* 打开危机 Flyout (Task 8 接线, 本任务先留 prop)
    onOpenLogin?(): void  //* 提供即访客态: 头像行显示 登录/注册, 条目交互上抛
    drawerOpen?: boolean  //* <768px 抽屉开合态 (仅驱动 className/遮罩渲染), 缺省即桌面形态
    onCloseDrawer?(): void
}

export default function Sidebar({
    section, collapsed, onSectionChange, onToggleCollapse, extensionsLabel,
    sessions, onDeleteSession, onOpenSession, onNewChat, menuOpen, onMenuToggle,
    onOpenLogin, drawerOpen, onCloseDrawer,
}: ISidebarProps): ReactElement
{
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const { user } = useAuth()
    const guest = onOpenLogin != null
    const drawer = drawerOpen === true
    const extBase = sectionRoute('extensions')

    //* 折叠切换持久化: 先按当前形态计算去向再落盘, 壳据此翻转 React 态 (存储所有权在组件, 壳只管渲染).
    const handleToggle = (): void =>
    {
        localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? 'expanded' : 'collapsed')
        onToggleCollapse()
    }

    //* 折叠图标列点节图标 = 展开侧栏并切到对应节 (双上抛, 壳负责导航).
    const expandTo = (next: SidebarSection): void =>
    {
        onSectionChange(next)
        onToggleCollapse()
    }

    const sidebarClass = ['sidebar', collapsed ? 'collapsed' : '', drawer ? 'drawer-open' : ''].
        filter(Boolean).
        join(' ')

    //* 汉堡钮 (头像行右槽): 开合态归壳持有, 菜单实体在壳 ([[UserMenu]] id 对应 aria-controls);
    //* 访客同样渲染 (红线: 危机入口对访客可达, 壳对访客菜单隐藏登出/门保护项过门), 两态共用同一按钮形态.
    const menuButton = (
        <button
            type="button"
            className="sidebar-menu"
            aria-label="打开菜单"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="user-menu"
            onClick={onMenuToggle}
        >
            <Icon name="menu" size={17} />
        </button>
    )

    //* 条目选中态: 当前路由即该扩展页 (总览 = /extensions, 条目 = /extensions/:id), 淡品牌底由 CSS 承载.
    const rowClass = (target: string): string => (pathname === target ? 'sidebar-row active' : 'sidebar-row')

    return (
        <aside className={sidebarClass} style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}>
            {/* 抽屉遮罩: 仅抽屉态渲染, 点击即关 (Escape 关闭归壳); 桌面端该节点根本不出现, 无回归面. */}
            {drawer && onCloseDrawer != null && (
                <div className="drawer-overlay" aria-hidden="true" onClick={onCloseDrawer} />
            )}
            <button
                type="button"
                className="sidebar-toggle"
                aria-expanded={!collapsed}
                aria-controls="sidebar-body"
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                onClick={handleToggle}
            >
                <Icon name="panel" size={17} className={collapsed ? 'icon-rot' : undefined} />
            </button>
            <div id="sidebar-body" className="sidebar-body">
                {collapsed ? (
                    <nav className="sidebar-rail" aria-label="侧栏快捷入口">
                        <button type="button" className="sidebar-mini" aria-label={extensionsLabel} title={extensionsLabel} onClick={() => expandTo('extensions')}>
                            <Icon name="grid" size={17} />
                        </button>
                        <button type="button" className="sidebar-mini" aria-label="会话" title="会话" onClick={() => expandTo('sessions')}>
                            <Icon name="chat" size={17} />
                        </button>
                        <button type="button" className="sidebar-mini" aria-label="新建会话" title="新建会话" onClick={() => onNewChat?.()}>
                            <Icon name="plus" size={17} />  //* 纯加号: 收起态与 chat 气泡拉开区分度 (走查裁决, 展开态有文字仍用 chat-plus).
                        </button>
                    </nav>
                ) : (
                    <>
                        <section className="sidebar-section">
                            <button
                                type="button"
                                className="sidebar-section-title"
                                aria-expanded={section === 'extensions'}
                                aria-controls="sidebar-section-extensions"
                                onClick={() => onSectionChange('extensions')}
                            >
                                <Icon name="grid" size={16} />
                                <span className="sidebar-section-name">{extensionsLabel}</span>
                                <Icon name="chevron" size={14} className="sidebar-section-arrow" />
                            </button>
                            {section === 'extensions' && (
                                <div id="sidebar-section-extensions" className="sidebar-items">
                                    {overviewProvider != null && (
                                        <button type="button" className={rowClass(extBase)} onClick={() => navigate(extBase)}>
                                            <Icon name={overviewProvider.icon} size={16} />
                                            <span className="sidebar-row-name">总览</span>
                                        </button>
                                    )}
                                    {extensions.map((e) => (
                                        <button
                                            key={e.id}
                                            type="button"
                                            className={rowClass(`${extBase}/${e.id}`)}
                                            onClick={() => navigate(`${extBase}/${e.id}`)}
                                        >
                                            <Icon name={e.icon} size={16} />
                                            <span className="sidebar-row-name">{e.name}</span>
                                            {e.mock === true && <span className="sidebar-tag">Mock</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                        <section className="sidebar-section">
                            <button
                                type="button"
                                className="sidebar-section-title"
                                aria-expanded={section === 'sessions'}
                                aria-controls="sidebar-section-sessions"
                                onClick={() => onSectionChange('sessions')}
                            >
                                <Icon name="chat" size={16} />
                                <span className="sidebar-section-name">会话</span>
                                <Icon name="chevron" size={14} className="sidebar-section-arrow" />
                            </button>
                            {section === 'sessions' && (
                                <div id="sidebar-section-sessions" className="sidebar-items">
                                    <button type="button" className="sidebar-new" onClick={() => onNewChat?.()}>
                                        <Icon name="chat-plus" size={16} />
                                        新建会话
                                    </button>
                                    {sessions == null || sessions.length === 0 ? (
                                        <p className="sidebar-empty">还没有会话, 想聊的时候随时开始.</p>
                                    ) : (
                                        <ul className="sidebar-list">
                                            {sessions.map((s) => (
                                                <li key={s.sessionId} className="sidebar-row">
                                                    <button
                                                        type="button"
                                                        className={s.title ? 'sidebar-row-main titled' : 'sidebar-row-main'}
                                                        onClick={() => onOpenSession?.(s.sessionId)}
                                                    >
                                                        {s.title ? (
                                                            //* 标题主行 + 预览副行 (titled 形态); 存量无标题维持单预览 (预览即主行).
                                                            <>
                                                                <span className="session-title">{s.title}</span>
                                                                <span className="session-preview">{s.preview}</span>
                                                            </>
                                                        ) : (
                                                            s.preview
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="sidebar-del"
                                                        aria-label={`删除会话: ${s.title ? s.title : s.preview}`}  //* 标题优先: aria 名应是会话的身份名, 预览 (末条消息) 只是无标题时的兜底 (与上方主行判定同口径).
                                                        onClick={() => onDeleteSession?.(s.sessionId)}
                                                    >
                                                        ×
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
            {/* 底部头像行: 登录用户 = 头像+用户名+汉堡钮, 访客 = 登录/注册 (折叠态缩为 "登录" 以适配 48px). */}
            <div className="sidebar-foot">
                {guest ? (
                    //* 访客双件套 (D18 结构照常): 姓名槽让位给登录钮, 汉堡照常在场 (危机入口红线, T6 评审整改).
                    //* 无 aria-label: 可访问名直接取可见文本, 折叠态 ("登录") 与展开态 ("登录 / 注册") 名实一致.
                    <>
                        <button type="button" className="sidebar-login" onClick={onOpenLogin}>
                            {collapsed ? '登录' : '登录 / 注册'}
                        </button>
                        {menuButton}
                    </>
                ) : (
                    <>
                        <span className="sidebar-avatar" aria-hidden="true">{(user?.username ?? '').charAt(0)}</span>
                        <span className="sidebar-username">{user?.username}</span>
                        {menuButton}
                    </>
                )}
            </div>
        </aside>
    )
}
