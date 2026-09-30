//* 应用壳: 左栏 + 主区插槽 (<Outlet/>), 登录浮层与 RED 预警弹窗的全局挂载点, 壳状态单一持有 (spec §4.2/§5.1):
//* 手风琴 section (默认会话节, 主区跟随 sectionRoute) / collapsed (soul.sidebar 持久化语义, 存储所有权在 Sidebar) /
//* menuOpen (汉堡用户菜单) / drawerOpen (移动端抽屉, 刻意不落盘) / crisisOpen (危机 Flyout, Task 8: 菜单 + RED 双入口) /
//* pendingDeleteId (删除确认模态, Task 11: 侧栏 × 请求删除 -> 壳级 alertdialog 二次确认后才真删).
//* 门桥接 (分层裁决): LoginSheet 不碰 AuthContext, 壳把它焊在门上 — onAuthed -> gate.confirm (补发 pending),
//* onCancel -> gate.cancel (丢弃). 受保护路由的访客门在 App.tsx (<RequireAuth>), 与此处共享同一扇门.
//* 会话状态提升 (Task 10 裁决沿用): 壳拥有 sessions (登录后拉取/登出即清) 与 openRequest 通道, 经 Outlet context 下发;
//* Task 9: `/` 主区即 ChatView (仅会话节路由可达, 扩展节展开即整体卸载), 通道契约保持不变.
//* Task 14: <768px 时侧栏经 CSS 媒体查询变 overlay 抽屉, 顶栏汉堡是唯一入口; 开合判定纯 CSS 媒体查询驱动,
//* jsdom 不求值媒体查询, 测试只断状态与节点在位性 (免 matchMedia mock).
import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { deleteSession, listSessions } from '../../api/chat'
import { useAuth } from '../../hooks/useAuth'
import { useAlert } from '../../hooks/useAlert'
import { useChatGate } from '../../hooks/useChatGate'
import { toast } from '../../utils/toast'
import { sectionRoute } from '../../utils/sidebarSections'
import LoginSheet from '../auth/LoginSheet'
import RedAlertModal from '../alert/RedAlertModal'
import CrisisFlyout from '../crisis/CrisisFlyout'
import ConfirmModal from '../ui/ConfirmModal'
import Icon from '../ui/Icon'
import UserMenu from './UserMenu'
import { useBrandName } from '../../hooks/useBrandName'
import Sidebar from './Sidebar'
import { SIDEBAR_PREF_KEY } from './Sidebar'
import type { SidebarSection } from '../../utils/sidebarSections'
import type { IChatViewContext, INewChatRequest, ISendRequest, ISessionOpenRequest } from '../../views/chatContext'
import type { ChatSessionVo } from '../../types'

export default function AppShell(): ReactElement
{
    const { user, logout } = useAuth()
    //* 品牌域接线 (评审整改 + D7): 品牌名与扩展板块显示名都来自后端部署配置, 浏览器标题随品牌名更新, 扩展名转交侧栏 (均兜底默认值).
    const { brand, extensionsLabel } = useBrandName()
    useEffect(() => { document.title = brand }, [brand])
    const gate = useChatGate()
    const { red, dismissRed } = useAlert()
    const navigate = useNavigate()
    //* 主区路由切换淡入的 key 闸 (Task 13, spec §9.1): pathname 变化即重挂容器重放入场动画 (见 .main-route 注).
    const { pathname } = useLocation()
    //* 惰性还原: 首渲染读偏好, 缺省展开 (存储取值归 Sidebar 所有, 这里只消费 'collapsed' 语义).
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed')
    //* 手风琴展开节 (默认会话节, spec §5.1): 节即路由 — onSectionChange 翻转状态并导航 sectionRoute.
    const [section, setSection] = useState<SidebarSection>('sessions')
    const [menuOpen, setMenuOpen] = useState(false)
    const [crisisOpen, setCrisisOpen] = useState(false)
    //* 会话状态带账号标签: 列表只对"拉取它的那个账号"可见 (派生判定, 账号切换瞬间旧列表立即失明,
    //* 防止 A 登出后 B 登录的取数间隙闪现 A 的会话预览 — 跨账号泄漏); 派生而非 effect 内同步清零.
    const [sessionState, setSessionState] = useState<{ owner: string | null; list: ChatSessionVo[] | null }>({ owner: null, list: null })
    const [openRequest, setOpenRequest] = useState<ISessionOpenRequest | null>(null)
    //* Task 12 通道 (情境卡唤起聊天): ContextRail 已随 homepage-v2 退场 (扩展 chips 插槽取代), 通道本体与
    //* ChatView 的 nonce 判重消费链保留 — 零生产者时恒 null 无害, 未来唤起类入口可原地复用 (回归测试钉住).
    const [sendRequest] = useState<ISendRequest | null>(null)
    //* 新建会话通道 (终审整改): 侧栏 "新建会话" 登录态路径的下发载体 — nonce 单调递增, 重复点击也重新触发,
    //* ChatView 以模块级台账判重消费 (startNewChat 复位). 会话状态归 ChatView 所有, 壳只发请求不越层操作.
    const [newChatRequest, setNewChatRequest] = useState<INewChatRequest | null>(null)
    //* 移动端抽屉开合态: 组件局部, 刻意不持久化 (桌面/移动共享同一状态, 落盘反而会在换端时误开抽屉).
    const [drawerOpen, setDrawerOpen] = useState(false)
    //* 删除确认流 (Task 11): pendingDeleteId 非空 = 确认模态在场 — 侧栏 × 只表达"请求删除", 真正删除
    //* 必须经 [[ConfirmModal]] 二次确认 (原生 window.confirm 已废: 暴露 URL 且预览不可控, D17 无预览契约).
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
    const sessions = user != null && sessionState.owner === user.userId ? sessionState.list : null

    //* 会话列表随登录态拉取: 拉取失败降级空列表 (侧栏显示空态文案, 不阻塞聊天); setState 全在异步回调,
    //* 不在 effect 体内同步触发级联渲染. 访客不拉取, 派生层直接失明.
    useEffect(() =>
    {
        if(user == null)
            return
        const owner = user.userId
        let alive = true
        listSessions().
            then(list => { if(alive) setSessionState({ owner, list }) }).
            catch(() => { if(alive) setSessionState({ owner, list: [] }) })
        return () => { alive = false }
    }, [user])

    //* 发送完成后由 ChatView 回调刷新 (新会话/预览变化): 失败保留旧列表不清空 (避免误触发 ChatView 复位);
    //* owner 沿用上一态 (刷新只发生在已登录的发送流程内).
    const reloadSessions = useCallback(() =>
    {
        listSessions().
            then(list => setSessionState(prev => ({ owner: prev.owner, list }))).
            catch(() => {})
    }, [])

    const handleOpenSession = useCallback((id: string) =>
    {
        //* 抽屉内点会话: 先收抽屉 (否则移动端抽屉继续盖住聊天区), 再 nonce 单调递增下发 —
        //* 同一会话重复点击也重新下发, 由 ChatView 的 openSession 幂等短路. 桌面端 drawerOpen 恒 false, 无副作用.
        setDrawerOpen(false)
        setOpenRequest(prev => ({ sessionId: id, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [])

    //* 手风琴节标题: 状态翻转 + 主区导航到该节路由 (映射归 utils/sidebarSections, 主区即路由区).
    const handleSectionChange = useCallback((next: SidebarSection) =>
    {
        setSection(next)
        navigate(sectionRoute(next))
    }, [navigate])

    //* 新建会话: 访客先过登录门 (红线: 访客任何交互触发登录浮层); 登录态经 nonce 通道下发 ChatView 复位
    //* (startNewChat, 终审整改 — 此前登录态路径无消费通道, 按钮对登录用户是死的). 先收抽屉: 桌面端无副作用,
    //* 抽屉内点按不至于盖着聊天区.
    const handleNewChat = useCallback(() =>
    {
        setDrawerOpen(false)
        if(user == null)
        {
            gate.requireAuth(() => {})
            return
        }
        setNewChatRequest(prev => ({ nonce: (prev?.nonce ?? 0) + 1 }))
    }, [gate, user])

    //* 菜单项统一收口: 先收菜单再执行动作, 保证菜单不跨路由/浮层残留. onClose 引用稳定 (UserMenu effect 依赖).
    const handleMenuClose = useCallback(() => { setMenuOpen(false) }, [])
    const handleOpenCrisis = useCallback(() =>
    {
        setMenuOpen(false)
        setCrisisOpen(true)
    }, [])
    const handleCrisisClose = useCallback(() => { setCrisisOpen(false) }, [])
    //* RED -> Flyout 桥 (Task 8): "查看全部求助资源" 上抛至此 — 先关 RED 再开 Flyout (两浮层互斥,
    //* 红线: RED 是永远置顶的安全模态, 不允许被 Flyout 盖住或长时间与 Flyout 同屏).
    const handleOpenResources = useCallback(() =>
    {
        dismissRed()
        setCrisisOpen(true)
    }, [dismissRed])
    const handleMenuNavigate = useCallback((to: string) =>
    {
        setMenuOpen(false)
        if(user == null)
        {
            //* 访客点门保护项: 过登录门而非导航 (pending no-op, 登录后原地放行到当前路由); 危机支持不走此路 (公开红线).
            gate.requireAuth(() => {})
            return
        }
        navigate(to)
    }, [gate, navigate, user])
    const handleLogout = useCallback(() =>
    {
        setMenuOpen(false)
        logout()
        navigate('/')  //* 登出后落回公开聊天位: 停在受保护路由上会被 <RequireAuth> 立即再开门.
    }, [logout, navigate])

    //* 抽屉 Escape 关闭: 仅打开期间挂 document 级监听, 收起/卸载即注销 (与登录浮层同形);
    //! 有意不与登录浮层抢 Escape: 抽屉内点登录会先收抽屉再开门, 两浮层不会同时在场.
    useEffect(() =>
    {
        if(!drawerOpen)
            return
        const onKey = (e: KeyboardEvent): void =>
        {
            if(e.key === 'Escape')
                setDrawerOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [drawerOpen])

    //* 删除两段式 (Task 11): 第一段 × 点击只记下待删 id 开模态 (侧栏 onDeleteSession 契约语义 = 请求删除,
    //* 侧栏本体不动); 第二段模态确认才真删. 先收模态再发请求: 删除成败都不让确认框滞留, 失败经 toast 提示,
    //! 失败保留原会话可重试, 不静默吞错.
    const handleRequestDeleteSession = useCallback((id: string) => { setPendingDeleteId(id) }, [])
    const handleCancelDelete = useCallback(() => { setPendingDeleteId(null) }, [])
    const handleConfirmDelete = useCallback(() =>
    {
        if(pendingDeleteId == null)
            return
        const id = pendingDeleteId
        setPendingDeleteId(null)
        deleteSession(id).
            then(() => setSessionState(prev => (prev.list == null ? prev : { owner: prev.owner, list: prev.list.filter(s => s.sessionId !== id) }))).
            catch(() => toast('会话删除失败, 请稍后再试.', 'error'))
    }, [pendingDeleteId])

    const ctx: IChatViewContext = { sessions, reloadSessions, openRequest, sendRequest, newChatRequest }

    return (
        <div className="shell">
            <Sidebar
                collapsed={collapsed}
                onToggleCollapse={() => setCollapsed((c) => !c)}
                section={section}
                onSectionChange={handleSectionChange}
                extensionsLabel={extensionsLabel}  //* D7: 扩展板块显示名经品牌端点下发 (SOULNOTES_EXTENSIONS_LABEL), 不再硬编码.
                sessions={sessions ?? undefined}
                onDeleteSession={handleRequestDeleteSession}  //* 契约语义 = 用户请求删除: 壳接确认模态, 确认后才真删 (Task 11).
                onOpenSession={handleOpenSession}
                onNewChat={handleNewChat}
                menuOpen={menuOpen}
                onMenuToggle={() => setMenuOpen((o) => !o)}  //* 菜单实体由壳在此渲染, 侧栏仅作 aria 镜像.
                onOpenCrisis={handleOpenCrisis}  //* 契约保留位: 危机入口实体在壳的汉堡菜单 (Task 8 换 Flyout).
                onOpenLogin={user == null ? () => { setDrawerOpen(false); gate.requireAuth(() => {}) } : undefined}
                drawerOpen={drawerOpen}
                onCloseDrawer={() => setDrawerOpen(false)}
            />
            {/* 汉堡用户菜单 (访客/登录用户均可达 — 红线: 危机入口对访客无门): guest 态下门保护项过登录门, 登出隐藏. */}
            {menuOpen && (
                <UserMenu
                    guest={user == null}
                    onClose={handleMenuClose}
                    onOpenCrisis={handleOpenCrisis}
                    onOpenProfile={() => handleMenuNavigate('/profile')}
                    onOpenSettings={() => handleMenuNavigate('/settings')}
                    onOpenAbout={() => handleMenuNavigate('/about')}
                    onLogout={handleLogout}
                />
            )}
            <main className="main">
                {/* 顶栏: 汉堡钮 (移动端抽屉唯一入口, 常驻 DOM, 桌面端 CSS display:none) + 天气胶囊 (仅登录后挂载,
                    访客不占位; 胶囊失败/数据缺席时 fail-silent 隐藏). */}
                <div className="topbar">
                    <button
                        type="button"
                        className="drawer-hamburger"
                        aria-label={drawerOpen ? '关闭导航菜单' : '打开导航菜单'}  //* 开合两态换向标签: aria-expanded 之外再给读屏一个动词级语义.
                        aria-expanded={drawerOpen}
                        aria-controls="sidebar-body"
                        onClick={() => setDrawerOpen((o) => !o)}  //* 切换而非只开: 标签随态换向 (关闭导航菜单) 时, 激活必须真的能关 — 名实一致.
                    >
                        <Icon name="menu" size={18} />
                    </button>
                </div>
                {/* 主区路由容器 (Task 13, spec §9.1): key=pathname 驱动路由切换淡入 (.main-route), 布局契约不变. */}
                <div className="main-route" key={pathname}>
                    <Outlet context={ctx} />
                </div>
            </main>
            {/* 危机 Flyout (Task 8): 常驻挂载, open=false 时组件自渲染 null; 菜单与 RED 双入口均落到此层 —
                号码默认兜底 + 三级缓存刷新 (零网络首绘可用), 遮罩点击/Escape/我知道了 三路关闭, 对访客无门 (红线). */}
            <CrisisFlyout open={crisisOpen} onClose={handleCrisisClose} />
            {/* 删除确认模态 (Task 11, D17 无预览): 常驻挂载 open 短路 (CrisisFlyout 同形), 文案为壳持有的固定拷贝,
                组件无 children/预览插槽 — 会话内容绝不在此复读. 取消/Escape/遮罩三路只关不删, 确认才走真删除. */}
            <ConfirmModal
                open={pendingDeleteId != null}
                title="删除这条会话?"
                body="删除后不可恢复"
                confirmText="删除"
                danger
                onClose={handleCancelDelete}
                onConfirm={handleConfirmDelete}
            />
            {/* 访客侧栏登录钮经 requireAuth(noop) 开门: pending 为空动作, confirm 时补发一次 no-op, cancel 丢弃, 均无副作用. */}
            {gate.open && <LoginSheet onAuthed={(d) => gate.confirm(d)} onCancel={gate.cancel} />}
            {/* RED 预警弹窗挂在路由内容之外 (Task 13 brief): 路由切换不卸载, z-index 置顶盖过登录浮层;
                关闭只经显式"我知道了"/上抛查看全部求助资源 (壳关 RED 并开危机 Flyout), 弹窗自身不响应 Escape. */}
            {red != null && <RedAlertModal alert={red} onClose={dismissRed} onOpenResources={handleOpenResources} />}
        </div>
    )
}
