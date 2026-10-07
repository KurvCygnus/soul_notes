//* RED 预警上下文读取 Hook: 与 [[useAuth]] 同源共享同一 Context 实例 (弹窗状态挂在 Provider 上).
import { useContext } from 'react'
import { AlertContext } from '../context/AlertContext'
import type { IAlertState } from '../context/AlertContext'

export function useAlert(): IAlertState
{
    const ctx = useContext(AlertContext)
    if(ctx == null)
        throw new Error('useAlert 必须在 <AlertProvider> 内使用')
    return ctx
}
