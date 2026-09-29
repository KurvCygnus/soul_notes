//* 应用壳: 左栏 + 主区插槽 (<Outlet/>), 同时是登录浮层的全局唯一挂载点.
//* 门桥接 (分层裁决): LoginSheet 不碰 AuthContext, 壳把它焊在门上 — onAuthed -> gate.confirm (补发 pending),
//* onCancel -> gate.cancel (丢弃). 侧栏登录钮与 Composer 发送拦截共用同一扇门, 浮层不会出现第二个实例.
//* 会话状态提升 (Task 10 裁决): 壳拥有 sessions (登录后拉取/登出即清) 与 openRequest (侧栏点击 →
//* ChatView 的打开请求通道, nonce 单调递增), 经 <Outlet context> 下发 (见 [[IChatViewContext]]);
//* 历史加载与流式发送归 ChatView. 侧栏删除经壳调 deleteSession, 删除打开中的会话由 ChatView 依
//* sessions 列表比对自行复位 hero (壳不追踪"当前打开"状态).
//* Task 12: 通道再延展 — sendRequest (情境卡 onAsk → ChatView 聊天模式发送, 同 nonce 机制);
//* 主区顶部加极简 topbar 挂天气胶囊 (仅登录后渲染, 胶囊自身 fail-silent).
import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Outlet } from 'react-router-dom'
import { deleteSession, listSessions } from '../../api/chat'
import { useAuth } from '../../hooks/useAuth'
import { useChatGate } from '../../hooks/useChatGate'
import { toast } from '../../utils/toast'
import WeatherCapsule from '../weather/WeatherCapsule'
import LoginSheet from '../auth/LoginSheet'
import Sidebar from './Sidebar'
import { SIDEBAR_PREF_KEY } from './Sidebar'
import type { IChatViewContext, ISendRequest, ISessionOpenRequest } from '../../views/chatContext'
import type { ChatSessionVo } from '../../types'

export default function AppShell(): ReactElement
{
    const { user } = useAuth()
    const gate = useChatGate()
    //* 惰性还原: 首渲染读偏好, 缺省展开 (存储取值归 Sidebar 所有, 这里只消费 'collapsed' 语义).
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed')
    //* 会话状态带账号标签: 列表只对"拉取它的那个账号"可见 (派生判定, 账号切换瞬间旧列表立即失明,
    //* 防止 A 登出后 B 登录的取数间隙闪现 A 的会话预览 — 跨账号泄漏); 派生而非 effect 内同步清零.
    const [sessionState, setSessionState] = useState<{ owner: string | null; list: ChatSessionVo[] | null }>({ owner: null, list: null })
    const [openRequest, setOpenRequest] = useState<ISessionOpenRequest | null>(null)
    const [sendRequest, setSendRequest] = useState<ISendRequest | null>(null)
    const sessions = user != null && sessionState.owner === user.userId ? sessionState.list : null

    //* 会话列表随登录态拉取: 拉取失败降级空列表 (侧栏显示"暂无会话", 不阻塞聊天); setState 全在异步回调,
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
        //* nonce 单调递增: 同一会话重复点击也重新下发, 由 ChatView 的 openSession 幂等短路.
        setOpenRequest(prev => ({ sessionId: id, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [])

    //* Task 12: 情境卡唤起 → 同一 nonce 机制下发 (ChatView 判重后路由进聊天发送管线).
    //* 判重台账在 ChatView 模块级 (跨挂载存活): 壳不必在登出/换号时清理 sendRequest, 台账挡住重放即可.
    const handleAsk = useCallback((q: string) =>
    {
        setSendRequest(prev => ({ content: q, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [])

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
                onOpenLogin={user == null ? () => gate.requireAuth(() => {}) : undefined}
                sessions={sessions ?? undefined}
                onDeleteSession={handleDeleteSession}
                onOpenSession={handleOpenSession}
                onAsk={handleAsk}
            />
            <main className="main">
                {/* 顶栏天气胶囊: 仅登录后挂载 (访客不占位); 胶囊对 401/空数据自行隐藏 (fail-silent). */}
                {user != null && (
                    <div className="topbar">
                        <WeatherCapsule />
                    </div>
                )}
                <Outlet context={ctx} />
            </main>
            {/* 访客侧栏登录钮经 requireAuth(noop) 开门: pending 为空动作, confirm 时补发一次 no-op, cancel 丢弃, 均无副作用. */}
            {gate.open && <LoginSheet onAuthed={(d) => gate.confirm(d)} onCancel={gate.cancel} />}
        </div>
    )
}
