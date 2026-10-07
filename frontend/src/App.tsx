//* 根组件: 全局 Provider + 路由表装配 (spec §4.2). 壳 (<AppShell/>) 持有侧栏手风琴/汉堡菜单/抽屉/危机占位状态,
//* 主区经 <Outlet/> 跟随手风琴节 (节即路由, sectionRoute 映射). 路由语义:
//* `/` 聊天位公开 (访客可达, ChatView 自带访客门接线; ADMIN 直达被重定向 /workbench — C1 双裁定: ADMIN
//* 不可用会话); /extensions 系收归 ADMIN 专属 (<RequireAdmin> — 非 ADMIN 含访客一律回首页, 不再开登录门);
//* / 设置 / 资料 登录保护 (<RequireAuth> — 访客渲染空并开门, confirm 补发原地放行); /crisis 不再是路由
//* (危机入口收进汉堡菜单, Flyout 归 Task 8), 未知路径一律回首页. AlertProvider 置于壳外全局层 (Task 13):
//* WS 预警通道与 showRed 全局唯一, 壳 (渲染弹窗) 可达 — RED 预警只走 WS 在线链 (D16 记一笔移除后日记兜底退场).
import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { AuthProvider } from './context/AuthContext'
import { AlertProvider } from './context/AlertContext'
import { useAuth } from './hooks/useAuth'
import { useChatGate } from './hooks/useChatGate'
import { findExtension, overviewProvider } from './extensions/registry'
import { ExtEmpty } from './extensions/helpers'
import { ToastHost } from './utils/toast'
import ChatView from './views/ChatView'
import PlaceholderView from './views/PlaceholderView'
import SettingsView from './views/SettingsView'
import WorkbenchView from './views/WorkbenchView'

//* 咨询员工作台角色门 (COUNSELOR/ADMIN 专属): 非 COUNSELOR/ADMIN (含访客与学生) 一律弹回首页 —
//* 与 <RequireAuth> 的访客登录门刻意不同: 咨询员账号在聊天端登录会被 LoginSheet 角色分流拒绝
//* ("请使用咨询员工作台"), 无从过门, 故直达一律重定向而非开门 (ADMIN 可经 LoginSheet 登入,
//* 其从聊天位落地的重定向归下方 <ChatRoute> 承接).
function RequireRole({ children }: { children: ReactElement }): ReactElement
{
    const { user } = useAuth()
    if(user == null || (user.role !== 'COUNSELOR' && user.role !== 'ADMIN'))
        return <Navigate to="/" replace />
    return children
}

//* 聊天位路由 (C1 双裁定: ADMIN 不可用会话): ADMIN 直达聊天主视图一律重定向工作台 (侧栏对 ADMIN 亦无
//* 会话区, 双侧同闭); 其余身份 (访客/STUDENT/COUNSELOR) 原样渲染 ChatView, 访客门接线归 ChatView 自持.
function ChatRoute(): ReactElement
{
    const { user } = useAuth()
    if(user?.role === 'ADMIN')
        return <Navigate to="/workbench" replace />
    return <ChatView />
}

//* 扩展治理路由门 (C1 双裁定): 扩展区域收归 ADMIN 专属 — 非 ADMIN (访客/STUDENT/COUNSELOR) 直达一律
//* 弹回首页. 刻意不复用 <RequireAuth> 的访客登录门: 扩展入口对非 ADMIN 已整体退场 (侧栏同闭),
//* 登录与否都无权到达治理视角, 开门只会制造"登录后仍被弹回"的死路.
function RequireAdmin({ children }: { children: ReactElement }): ReactElement
{
    const { user } = useAuth()
    if(user == null || user.role !== 'ADMIN')
        return <Navigate to="/" replace />
    return children
}

//* 访客保护路由包装 (门语义复用 [[useChatGate]] 的 confirm 补发): 访客渲染空占位并由 effect 开门,
//* pending 为 no-op — 真正的放行是 confirm 落登录态后的重渲染; 登录用户原样透传 (requireAuth 内直接短路).
function RequireAuth({ children }: { children: ReactElement }): ReactElement
{
    const { user } = useAuth()
    const { requireAuth } = useChatGate()
    useEffect(() =>
    {
        if(user == null)
            requireAuth(() => {})  //* no-op pending: 登录成功补发一次空动作, 页面随登录态原地放行.
    }, [user, requireAuth])
    if(user == null)
        return <></>
    return children
}

//* 扩展总览路由 (D9 运行期条件): 有总览提供者渲染之, 否则空态文案兜底不白屏.
//* 空态包一层 .ext-page-empty (冒烟走查改进): 裸 <p> 直落 .main-route 顶边观感生硬, 撑满路由区
//* 居中后空态不再贴顶 — 样式见 base.css, 与 .chat-placeholder 同一套居中惯例.
function ExtensionsOverview(): ReactElement
{
    const Overview = overviewProvider?.overview
    if(Overview == null)
        return (
            <div className="ext-page-empty">
                <ExtEmpty text="暂无已接入的扩展" />
            </div>
        )
    return (
        <div className="ext-page">
            <Overview />
        </div>
    )
}

//* 扩展详情路由: id 未命中一律重定向回总览; 命中则渲染其 page — 页面零 props, 取数自持 (只读 ext api, D11).
function ExtensionPageRoute(): ReactElement
{
    const { id } = useParams()
    const ext = id == null ? undefined : findExtension(id)
    if(ext == null)
        return <Navigate to="/extensions" replace />
    const Page = ext.page
    return (
        <div className="ext-page">
            <Page />
        </div>
    )
}

export default function App(): ReactElement
{
    return (
        <BrowserRouter>
            <AuthProvider>
                <AlertProvider>
                    <Routes>
                        <Route element={<AppShell />}>
                            <Route index element={<ChatRoute />} />
                            <Route path="extensions" element={<RequireAdmin><ExtensionsOverview /></RequireAdmin>} />
                            <Route path="extensions/:id" element={<RequireAdmin><ExtensionPageRoute /></RequireAdmin>} />
                            <Route path="profile" element={<RequireAuth><PlaceholderView title="个人资料" /></RequireAuth>} />
                            <Route path="settings" element={<RequireAuth><SettingsView /></RequireAuth>} />
                            {/* 咨询员工作台 (角色门): 端点 403 的兜底降级页归 WorkbenchView 自持, 这里只挡渲染入口. */}
                            <Route path="workbench" element={<RequireRole><WorkbenchView /></RequireRole>} />
                            {/* /about 已随菜单关于项退场 (走查裁决 2026-10-03): 设置页关于区块是唯一信息源;
                                /crisis 不再是路由 (产品红线转由菜单内危机占位承接, Task 8 换 Flyout), 与未知路径一并回首页. */}
                            <Route path="crisis" element={<Navigate to="/" replace />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Route>
                    </Routes>
                </AlertProvider>
            </AuthProvider>
            {/* 全局 toast 宿主: 模块级 store 只需根部挂载一次 — 曾漏挂导致全应用 toast (登录失败/
                删除失败/麦克风授权等) 静默不可见 (走查实测: 错误密码零反馈). */}
            <ToastHost />
        </BrowserRouter>
    )
}
