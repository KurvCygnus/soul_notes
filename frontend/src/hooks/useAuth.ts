//* 认证上下文读取 Hook: 与 [[useChatGate]] 同源共享同一 Context 实例 (门状态挂在 Provider 上).
import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'
import type { IAuthContextValue, IAuthState } from '../context/AuthContext'

//* 共享读取器: 登录切片与门切片同源, 脱离 <AuthProvider> 使用即硬错误 (防止门静默失联).
export function useAuthContext(): IAuthContextValue
{
    const ctx = useContext(AuthContext)
    if(ctx == null)
        throw new Error('useAuth/useChatGate 必须在 <AuthProvider> 内使用')
    return ctx
}

export function useAuth(): IAuthState
{
    const { user, login, logout } = useAuthContext()
    return { user, login, logout }
}
