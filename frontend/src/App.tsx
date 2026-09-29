//* 根组件: 全局 Provider + 路由表装配. / 与 /crisis 均经壳渲染, /crisis 公开 (产品红线), 其余路径重定向回 /.
import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { AuthProvider } from './context/AuthContext'
import CrisisView from './views/CrisisView'
import ChatView from './views/ChatView'

export default function App(): ReactElement
{
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route element={<AppShell />}>
                        {/* Task 10: 占位问候已由 ChatView 取代 (hero 空态文案保持原样, 会话状态经壳的 Outlet context 下发). */}
                        <Route index element={<ChatView />} />
                        <Route path="crisis" element={<CrisisView />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
