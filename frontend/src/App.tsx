//* 根组件: 全局 Provider + 路由表装配. / 与 /crisis 均经壳渲染, /crisis 公开 (产品红线), 其余路径重定向回 /.
import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { AuthProvider } from './context/AuthContext'
import CrisisView from './views/CrisisView'

//* 聊天占位: 居中问候语, Task 10 替换为真实 ChatView (消息流/Composer). 文案守非医疗化风格.
function ChatPlaceholder(): ReactElement
{
    return (
        <div className="chat-placeholder">
            <h1>你好, 今天想聊点什么?</h1>
            <p>我是你的倾听伙伴, 任何想法都可以在这里慢慢说.</p>
        </div>
    )
}

export default function App(): ReactElement
{
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route element={<AppShell />}>
                        <Route index element={<ChatPlaceholder />} />
                        <Route path="crisis" element={<CrisisView />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
