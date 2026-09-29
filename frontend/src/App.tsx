//* 根组件: 全局 Provider + 路由表装配. / 与 /crisis 均经壳渲染, /crisis 公开 (产品红线), 其余路径重定向回 /.
//* AlertProvider 置于壳外全局层 (Task 13): WS 预警通道与 showRed 全局唯一, 壳 (渲染弹窗) 与壳内
//* useChatSend (日记 RED 兜底) 都可达 — 记一笔的预警不依赖弹窗挂载点, 只依赖上下文可达.
import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { AuthProvider } from './context/AuthContext'
import { AlertProvider } from './context/AlertContext'
import CrisisView from './views/CrisisView'
import ChatView from './views/ChatView'

export default function App(): ReactElement
{
    return (
        <BrowserRouter>
            <AuthProvider>
                <AlertProvider>
                    <Routes>
                        <Route element={<AppShell />}>
                            {/* Task 10: 占位问候已由 ChatView 取代 (hero 空态文案保持原样, 会话状态经壳的 Outlet context 下发). */}
                            <Route index element={<ChatView />} />
                            <Route path="crisis" element={<CrisisView />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Route>
                    </Routes>
                </AlertProvider>
            </AuthProvider>
        </BrowserRouter>
    )
}
