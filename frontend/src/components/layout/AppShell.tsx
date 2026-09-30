//* 应用壳: 左栏 + 主区插槽 (<Outlet/>), 同时是登录浮层的全局唯一挂载点.
//* 门桥接 (分层裁决): LoginSheet 不碰 AuthContext, 壳把它焊在门上 — onAuthed -> gate.confirm (补发 pending),
//* onCancel -> gate.cancel (丢弃). 侧栏登录钮与 Composer 发送拦截共用同一扇门, 浮层不会出现第二个实例.
//* 会话状态提升 (Task 10 裁决): 壳拥有 sessions (登录后拉取/登出即清) 与 openRequest (侧栏点击 →
//* ChatView 的打开请求通道, nonce 单调递增), 经 <Outlet context> 下发 (见 [[IChatViewContext]]);
//* 历史加载与流式发送归 ChatView. 侧栏删除经壳调 deleteSession, 删除打开中的会话由 ChatView 依
//* sessions 列表比对自行复位 hero (壳不追踪"当前打开"状态).
//* Task 12: 通道再延展 — sendRequest (情境卡唤起聊天发送); Task 5 起该通道只读占位 (ContextRail 出侧栏, Task 9 恢复写入);
//* 主区顶部加极简 topbar 挂天气胶囊 (仅登录后渲染, 胶囊自身 fail-silent).
//* Task 14: topbar 常驻并挂汉堡钮 — <768px 时侧栏经 CSS 媒体查询变 overlay 抽屉, 汉堡是唯一入口.
//* 抽屉开合态是组件局部 React 态 (不落盘); 访客同样可见 (危机支持是公开路由红线, 移动端不能没有侧栏入口).
//* 开合判定纯 CSS 媒体查询驱动: jsdom 不求值媒体查询, 既有测试零改动保持桌面形态 (免 matchMedia mock).
//* Task 5 过渡适配: 侧栏契约换新 (手风琴), 壳最小改动保持可编译可跑 — section/menuOpen 状态与回调在此临时持有,
//* 完整壳重构 (主区跟随/汉堡菜单实体/访客保护路由) 归 Task 6, 危机 Flyout 接线归 Task 8, 删除模态归 Task 11.
import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { deleteSession, listSessions } from '../../api/chat'
import { useAuth } from '../../hooks/useAuth'
import { useAlert } from '../../hooks/useAlert'
import { useChatGate } from '../../hooks/useChatGate'
import { toast } from '../../utils/toast'
import { sectionRoute } from '../../utils/sidebarSections'
import WeatherCapsule from '../weather/WeatherCapsule'
import LoginSheet from '../auth/LoginSheet'
import RedAlertModal from '../alert/RedAlertModal'
import Icon from '../ui/Icon'
import { useBrandName } from '../../hooks/useBrandName'
import Sidebar from './Sidebar'
import { SIDEBAR_PREF_KEY } from './Sidebar'
import type { SidebarSection } from '../../utils/sidebarSections'
import type { IChatViewContext, ISendRequest, ISessionOpenRequest } from '../../views/chatContext'
import type { ChatSessionVo } from '../../types'

export default function AppShell(): ReactElement
{
    const { user } = useAuth()
    //* 品牌接线 (评审整改): 品牌名来自后端 app.brand-name 配置, 浏览器标题随其更新 (兜底中文产品名).
    const brand = useBrandName()
    useEffect(() => { document.title = brand }, [brand])
    const gate = useChatGate()
    const { red, dismissRed } = useAlert()
    const navigate = useNavigate()
    //* 惰性还原: 首渲染读偏好, 缺省展开 (存储取值归 Sidebar 所有, 这里只消费 'collapsed' 语义).
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed')
    //* 手风琴展开节 (默认会话节, spec §5.1) 与汉堡菜单开合态: Task 5 过渡期由壳持有, Task 6 壳重构沿用.
    const [section, setSection] = useState<SidebarSection>('sessions')
    const [menuOpen, setMenuOpen] = useState(false)
    //* 会话状态带账号标签: 列表只对"拉取它的那个账号"可见 (派生判定, 账号切换瞬间旧列表立即失明,
    //* 防止 A 登出后 B 登录的取数间隙闪现 A 的会话预览 — 跨账号泄漏); 派生而非 effect 内同步清零.
    const [sessionState, setSessionState] = useState<{ owner: string | null; list: ChatSessionVo[] | null }>({ owner: null, list: null })
    const [openRequest, setOpenRequest] = useState<ISessionOpenRequest | null>(null)
    //* Task 12 通道 (情境卡唤起聊天) 随 ContextRail 出侧栏暂时失联: 只读占位, Task 9 随 ChatView 重构恢复写入.
    const [sendRequest] = useState<ISendRequest | null>(null)
    //* 移动端抽屉开合态: 组件局部, 刻意不持久化 (桌面/移动共享同一状态, 落盘反而会在换端时误开抽屉).
    const [drawerOpen, setDrawerOpen] = useState(false)
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

    //* 手风琴节标题: 状态翻转 + 主区导航到该节路由 (sectionRoute 映射归 utils, Task 6 主区跟随沿用).
    const handleSectionChange = useCallback((next: SidebarSection) =>
    {
        setSection(next)
        navigate(sectionRoute(next))
    }, [navigate])

    //* 新建会话: 访客先过登录门 (红线: 访客任何交互触发登录浮层); 登录态 Task 9 接线 ChatView 复位,
    //* 过渡期仅收抽屉 (桌面端无副作用, 抽屉内点按不至于盖着聊天区).
    const handleNewChat = useCallback(() =>
    {
        setDrawerOpen(false)
        if(user == null)
            gate.requireAuth(() => {})
    }, [gate, user])

    //* 抽屉 Escape 关闭: 仅打开期间挂 document 级监听, 收起/卸载即注销 (与 LoginSheet 同形);
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

    const handleDeleteSession = useCallback((id: string) =>
    {
        deleteSession(id).
            then(() => setSessionState(prev => (prev.list == null ? prev : { owner: prev.owner, list: prev.list.filter(s => s.sessionId !== id) }))).
            catch(() => toast('会话删除失败, 请稍后再试.', 'error'))  //! 失败保留原会话可重试, 不静默吞错.
    }, [])

    const ctx: IChatViewContext = { sessions, reloadSessions, openRequest, sendRequest }

    return (
        <div className="shell">
            <Sidebar
                collapsed={collapsed}
                onToggleCollapse={() => setCollapsed((c) => !c)}
                section={section}
                onSectionChange={handleSectionChange}
                extensionsLabel="扩展"  //* Task 12 下发部署配置前先用默认值.
                sessions={sessions ?? undefined}
                onDeleteSession={handleDeleteSession}
                onOpenSession={handleOpenSession}
                onNewChat={handleNewChat}
                menuOpen={menuOpen}
                onMenuToggle={() => setMenuOpen((o) => !o)}  //* 菜单实体 Task 6 渲染, 过渡期仅持态.
                onOpenCrisis={() => navigate('/crisis')}  //* Task 8 换危机 Flyout 开关.
                onOpenLogin={user == null ? () => { setDrawerOpen(false); gate.requireAuth(() => {}) } : undefined}
                drawerOpen={drawerOpen}
                onCloseDrawer={() => setDrawerOpen(false)}
            />
            <main className="main">
                {/* 顶栏: 汉堡钮 (移动端抽屉唯一入口, 常驻 DOM, 桌面端 CSS display:none) + 天气胶囊 (仅登录后挂载,
                    访客不占位; 胶囊失败/数据缺席时 fail-silent 隐藏, 成功但今日无记录则显示空态文案). */}
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
                    {user != null && <WeatherCapsule />}
                </div>
                <Outlet context={ctx} />
            </main>
            {/* 访客侧栏登录钮经 requireAuth(noop) 开门: pending 为空动作, confirm 时补发一次 no-op, cancel 丢弃, 均无副作用. */}
            {gate.open && <LoginSheet onAuthed={(d) => gate.confirm(d)} onCancel={gate.cancel} />}
            {/* RED 预警弹窗挂在路由内容之外 (Task 13 brief): / ↔ /crisis 切换不卸载, z-index 置顶盖过登录浮层;
                关闭只经显式"我知道了"/跳转危机页, 弹窗自身不响应 Escape. */}
            {red != null && <RedAlertModal alert={red} onClose={dismissRed} />}
        </div>
    )
}
