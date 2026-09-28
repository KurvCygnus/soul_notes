//* 访客门: 访客点发送时由 Composer 调 requireAuth 拦截, ChatView 依 open 滑入登录浮层,
//* 登录成功 confirm 自动补发 pending 消息, cancel 丢弃. 门状态挂在 AuthContext 上全局唯一.
import { useAuthContext } from './useAuth'
import type { IChatGate } from '../context/AuthContext'

export function useChatGate(): IChatGate
{
    return useAuthContext().gate
}
