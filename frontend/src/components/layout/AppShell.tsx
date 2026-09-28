//* 应用壳: 左栏 + 主区插槽 (<Outlet/>), 同时是登录浮层的全局唯一挂载点.
//* 门桥接 (分层裁决): LoginSheet 不碰 AuthContext, 壳把它焊在门上 — onAuthed -> gate.confirm (补发 pending),
//* onCancel -> gate.cancel (丢弃). 侧栏登录钮与 Composer 发送拦截共用同一扇门, 浮层不会出现第二个实例.
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useChatGate } from '../../hooks/useChatGate'
import LoginSheet from '../auth/LoginSheet'
import Sidebar from './Sidebar'
import { SIDEBAR_PREF_KEY } from './Sidebar'

export default function AppShell(): ReactElement
{
    const { user } = useAuth()
    const gate = useChatGate()
    //* 惰性还原: 首渲染读偏好, 缺省展开 (存储取值归 Sidebar 所有, 这里只消费 'collapsed' 语义).
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed')

    return (
        <div className="shell">
            <Sidebar
                collapsed={collapsed}
                onToggle={() => setCollapsed((c) => !c)}
                onOpenLogin={user == null ? () => gate.requireAuth(() => {}) : undefined}
            />
            <main className="main">
                <Outlet />
            </main>
            {/* 访客侧栏登录钮经 requireAuth(noop) 开门: pending 为空动作, confirm 时补发一次 no-op, cancel 丢弃, 均无副作用. */}
            {gate.open && <LoginSheet onAuthed={(d) => gate.confirm(d)} onCancel={gate.cancel} />}
        </div>
    )
}
