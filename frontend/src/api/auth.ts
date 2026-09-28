//* 认证域 API: 登录/注册 (免认证端点) + 本地会话存储 (`soul.token` / `soul.auth` 双键约定).
import { api, TOKEN_KEY } from './http'
import type { AuthData } from '../types'

//* 登录态展示信息 (userId/username/role) 的存储键, 与 [[TOKEN_KEY]] 分开存: 令牌可独立清除而不丢展示名.
export const AUTH_KEY = 'soul.auth'

//region 本地会话存取

//* 双键落盘唯一所有权仍在 auth.ts: 导出供 AuthContext 的 confirm 补发路径复用, 禁止在 UI 层重写双键写入.
export function persistAuth(data: AuthData): void
{
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(AUTH_KEY, JSON.stringify(data))
}

//* 读取缓存的登录态; 键缺席或内容损坏 (手改/半写) 时返回 null, 视同未登录.
export function getStoredAuth(): AuthData | null
{
    const raw = localStorage.getItem(AUTH_KEY)
    if(raw == null)
        return null
    try
    {
        const v: unknown = JSON.parse(raw)
        if(typeof v === 'object' && v != null && typeof (v as Record<string, unknown>).token === 'string')
            return v as AuthData
        return null
    }
    catch
    {
        return null
    }
}

//endregion

//region 端点

export async function login(username: string, password: string): Promise<AuthData>
{
    const data = await api<AuthData>('/api/v1/auth/login', {
        method: 'POST',
        body: { username, password },
        auth: false,
    })
    persistAuth(data)
    return data
}

export async function register(username: string, password: string): Promise<AuthData>
{
    //* role 固定 STUDENT: 注册入口只面向学生, 咨询师账号由管理侧开通, 防止自授角色越权.
    const data = await api<AuthData>('/api/v1/auth/register', {
        method: 'POST',
        body: { username, password, role: 'STUDENT' },
        auth: false,
    })
    persistAuth(data)
    return data
}

//* 本地登出: 清双键即视为未登录; 服务端黑名单注销为尽力而为 — [[api]] 在调用瞬间同步读取令牌,
//* 故先发起请求再清键即已携带 JWT, 而离线/失败不阻塞本地登出 (离线安全网语义).
export function logout(): void
{
    void api('/api/v1/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(AUTH_KEY)
}

//? getStoredAuth 与 http.getToken 并存: 后者只判"是否登录", 前者供 UI 还原用户名/角色, 消费方按需取用.
