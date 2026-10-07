//* 认证上下文: 登录态 (localStorage 持久化, 存储所有权在 auth.ts) + 访客门状态机.
//* 依设计裁决: 门必须感知登录态, 故登录态与门状态同挂一个 Provider 全局唯一, Composer 拦截与 ChatView 浮层天然同步.
//* 本文件只导出 Provider 与类型 (零警告要求: 组件文件不混导 Hook), 读取器 useAuth/useChatGate 在 hooks/ 下.
import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getStoredAuth, logout as authLogout, persistAuth } from '../api/auth'
import { setUnauthorizedHandler } from '../api/http'
import type { AuthData } from '../types'

//* 登录态切片: [[useAuth]] 的返回契约 (ChatView 等消费).
export interface IAuthState
{
    user: AuthData | null
    login(data: AuthData): void
    logout(): void
}

//* 访客门切片: [[useChatGate]] 的返回契约 (Composer 发送拦截/ChatView 浮层消费).
//* pending 为被门拦截的动作闭包, open 驱动登录浮层滑入 (产品决策 D6: 访客可打字, 点发送才登录).
export interface IChatGate
{
    open: boolean
    pending: (() => void) | null
    requireAuth(action: () => void): void
    confirm(authed: AuthData): void
    cancel(): void
}

export interface IAuthContextValue extends IAuthState
{
    gate: IChatGate
}

//* 单例上下文: null 表示未挂 <AuthProvider>, 读取器据此硬报错.
const AuthContext = createContext<IAuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode })
{
    //* 惰性水合: 首渲染即从 localStorage 还原, 避免闪一帧"未登录"误开访客门.
    const [user, setUser] = useState<AuthData | null>(() => getStoredAuth())
    const [gateOpen, setGateOpen] = useState(false)
    //* pending 双轨: ref 是同步闩锁 (confirm 重入/连点只补发一次), state 仅作渲染暴露 (渲染期禁止读 ref).
    const [pendingView, setPendingView] = useState<(() => void) | null>(null)
    const pendingRef = useRef<(() => void) | null>(null)
    //* user 镜像: 401 广播等异步回调需读最新登录态, 不能依赖渲染闭包.
    const userRef = useRef(user)

    const login = useCallback((data: AuthData) =>
    {
        persistAuth(data)//* 双键落盘归 auth.ts 所有, 这里只复用不重写.
        userRef.current = data
        setUser(data)
    }, [])

    const logout = useCallback(() =>
    {
        //* 幂等护栏: 登出请求自身也可能 401 再广播, 已登出即短路, 否则形成 401->登出->401 无限循环.
        if(userRef.current == null)
            return
        userRef.current = null
        authLogout()//* 清双键 + 尽力而为的服务端注销, 所有权在 auth.ts.
        setUser(null)
    }, [])

    const requireAuth = useCallback((action: () => void) =>
    {
        if(userRef.current != null)
        {
            action()//* 已登录: 直接放行, 登录用户永不进门 (设计裁决).
            return
        }
        pendingRef.current = action
        setPendingView(() => action)//* 惰性形式: 防止 React 把 action 当 updater 调用.
        setGateOpen(true)
    }, [])

    const confirm = useCallback((authed: AuthData) =>
    {
        //* 先取空再补发: ref 同步清零, confirm 重入或连点也只补发一次 (StrictMode 下同样安全).
        const action = pendingRef.current
        pendingRef.current = null
        setPendingView(null)
        setGateOpen(false)
        login(authed)
        //* 必须先落登录态 (令牌同步写入 localStorage), pending 内的发送请求才能带上新 JWT.
        action?.()
    }, [login])

    const cancel = useCallback(() =>
    {
        pendingRef.current = null//* 丢弃闭包引用: 被拦截的发送动作永不执行.
        setPendingView(null)
        setGateOpen(false)
    }, [])

    //* 401 广播接线: 任一请求会话失效即全局登出; 卸载时注销回调, 防止泄漏闭包继续改写全局存储.
    useEffect(() =>
    {
        setUnauthorizedHandler(logout)
        return () => setUnauthorizedHandler(null)
    }, [logout])

    const value: IAuthContextValue =
    {
        user,
        login,
        logout,
        gate: { open: gateOpen, pending: pendingView, requireAuth, confirm, cancel },
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export { AuthContext }
