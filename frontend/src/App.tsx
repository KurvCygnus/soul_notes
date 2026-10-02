//* 根组件: 全局 Provider + 路由表装配 (spec §4.2). 壳 (<AppShell/>) 持有侧栏手风琴/汉堡菜单/抽屉/危机占位状态,
//* 主区经 <Outlet/> 跟随手风琴节 (节即路由, sectionRoute 映射). 路由语义:
//* `/` 聊天位公开 (访客可达, ChatView 自带访客门接线); /extensions 系 / 设置 / 资料 / 关于 登录保护
//* (<RequireAuth> — 访客渲染空并开门, confirm 补发原地放行); /crisis 不再是路由 (危机入口收进汉堡菜单,
//* Flyout 归 Task 8), 未知路径一律回首页. AlertProvider 置于壳外全局层 (Task 13): WS 预警通道与 showRed
//* 全局唯一, 壳 (渲染弹窗) 可达 — RED 预警只走 WS 在线链 (D16 记一笔移除后日记兜底退场).
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
import { getContextSummary } from './api/context'
import { ToastHost } from './utils/toast'
import ChatView from './views/ChatView'
import PlaceholderView from './views/PlaceholderView'
import SettingsView from './views/SettingsView'

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
function ExtensionsOverview(): ReactElement
{
    const Overview = overviewProvider?.overview
    if(Overview == null)
        return <ExtEmpty text="暂无已接入的扩展" />
    return (
        <div className="ext-page">
            <Overview />
        </div>
    )
}

//* 扩展详情路由: id 未命中一律重定向回总览; 命中则渲染其 page, 能力契约只注入只读 context 查询 (D11).
function ExtensionPageRoute(): ReactElement
{
    const { id } = useParams()
    const ext = id == null ? undefined : findExtension(id)
    if(ext == null)
        return <Navigate to="/extensions" replace />
    const Page = ext.page
    return (
        <div className="ext-page">
            <Page query={{ context: getContextSummary }} />
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
                            <Route index element={<ChatView />} />
                            <Route path="extensions" element={<RequireAuth><ExtensionsOverview /></RequireAuth>} />
                            <Route path="extensions/:id" element={<RequireAuth><ExtensionPageRoute /></RequireAuth>} />
                            <Route path="profile" element={<RequireAuth><PlaceholderView title="个人资料" /></RequireAuth>} />
                            <Route path="settings" element={<RequireAuth><SettingsView /></RequireAuth>} />
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
