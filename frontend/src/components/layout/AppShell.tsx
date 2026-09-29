//* 应用壳: 左栏 + 主区插槽 (<Outlet/>), 同时是登录浮层的全局唯一挂载点.
//* 门桥接 (分层裁决): LoginSheet 不碰 AuthContext, 壳把它焊在门上 — onAuthed -> gate.confirm (补发 pending),
//* onCancel -> gate.cancel (丢弃). 侧栏登录钮与 Composer 发送拦截共用同一扇门, 浮层不会出现第二个实例.
//* 会话状态提升 (Task 10 裁决): 壳拥有 sessions (登录后拉取/登出即清) 与 openRequest (侧栏点击 →
//* ChatView 的打开请求通道, nonce 单调递增), 经 <Outlet context> 下发 (见 [[IChatViewContext]]);
//* 历史加载与流式发送归 ChatView. 侧栏删除经壳调 deleteSession, 删除打开中的会话由 ChatView 依
//* sessions 列表比对自行复位 hero (壳不追踪"当前打开"状态).
//* Task 12: 通道再延展 — sendRequest (情境卡 onAsk → ChatView 聊天模式发送, 同 nonce 机制);
//* 主区顶部加极简 topbar 挂天气胶囊 (仅登录后渲染, 胶囊自身 fail-silent).
//* Task 14: topbar 常驻并挂汉堡钮 — <768px 时侧栏经 CSS 媒体查询变 overlay 抽屉, 汉堡是唯一入口.
//* 抽屉开合态是组件局部 React 态 (不落盘); 访客同样可见 (危机支持是公开路由红线, 移动端不能没有侧栏入口).
//* 开合判定纯 CSS 媒体查询驱动: jsdom 不求值媒体查询, 既有测试零改动保持桌面形态 (免 matchMedia mock).
import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Outlet } from 'react-router-dom'
import { deleteSession, listSessions } from '../../api/chat'
import { useAuth } from '../../hooks/useAuth'
import { useAlert } from '../../hooks/useAlert'
import { useChatGate } from '../../hooks/useChatGate'
import { toast } from '../../utils/toast'
import WeatherCapsule from '../weather/WeatherCapsule'
import LoginSheet from '../auth/LoginSheet'
import RedAlertModal from '../alert/RedAlertModal'
import Sidebar from './Sidebar'
import { SIDEBAR_PREF_KEY } from './Sidebar'
import type { IChatViewContext, ISendRequest, ISessionOpenRequest } from '../../views/chatContext'
import type { ChatSessionVo } from '../../types'

export default function AppShell(): ReactElement
{
    const { user } = useAuth()
    const gate = useChatGate()
    const { red, dismissRed } = useAlert()
    //* 惰性还原: 首渲染读偏好, 缺省展开 (存储取值归 Sidebar 所有, 这里只消费 'collapsed' 语义).
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed')
    //* 会话状态带账号标签: 列表只对"拉取它的那个账号"可见 (派生判定, 账号切换瞬间旧列表立即失明,
    //* 防止 A 登出后 B 登录的取数间隙闪现 A 的会话预览 — 跨账号泄漏); 派生而非 effect 内同步清零.
    const [sessionState, setSessionState] = useState<{ owner: string | null; list: ChatSessionVo[] | null }>({ owner: null, list: null })
    const [openRequest, setOpenRequest] = useState<ISessionOpenRequest | null>(null)
    const [sendRequest, setSendRequest] = useState<ISendRequest | null>(null)
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

    //* Task 12: 情境卡唤起 → 同一 nonce 机制下发 (ChatView 判重后路由进聊天发送管线).
    //* 判重台账在 ChatView 模块级 (跨挂载存活): 壳不必在登出/换号时清理 sendRequest, 台账挡住重放即可.
    const handleAsk = useCallback((q: string) =>
    {
        setDrawerOpen(false)  //* 同 handleOpenSession: 抽屉内点情境卡, 发送后让用户看到聊天流.
        setSendRequest(prev => ({ content: q, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [])

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
                onToggle={() => setCollapsed((c) => !c)}
                onOpenLogin={user == null ? () => { setDrawerOpen(false); gate.requireAuth(() => {}) } : undefined}
                sessions={sessions ?? undefined}
                onDeleteSession={handleDeleteSession}
                onOpenSession={handleOpenSession}
                onAsk={handleAsk}
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
                        ☰
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
