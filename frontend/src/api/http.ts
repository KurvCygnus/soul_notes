import type { ApiResponse } from '../types'

//* localStorage 令牌键, 沿用旧应用约定.
export const TOKEN_KEY = 'soul.token'

//* 统一错误形态: code 携带后端业务码, HTTP 层失败时携带 HTTP 状态码.
export class ApiError extends Error
{
    readonly code: number

    constructor(code: number, message: string)
    {
        super(message)
        this.name = 'ApiError'
        this.code = code
    }
}

export interface IApiOptions
{
    method?: string
    body?: unknown
    //* auth 为 false 时即使本地持有令牌也不注入 Authorization (登录/注册/热线等免认证端点).
    auth?: boolean
    signal?: AbortSignal
    headers?: Record<string, string>
}

//region 401 广播与令牌读取

let unauthorizedHandler: (() => void) | null = null

//* 注册全局未授权回调 (后续 useChatGate 接管: 清令牌 + 弹登录), 传 null 注销.
export function setUnauthorizedHandler(handler: (() => void) | null): void { unauthorizedHandler = handler }

//* 读取当前 JWT, null 表示未登录.
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }

//endregion

/**
 * 统一请求入口: 注入 JWT, 解包 `{code,message,data}` 壳.
 * 业务失败 (code != 0) 与 HTTP 层失败均以 [[ApiError]] 拒绝, 401 额外广播全局回调.
 */
export async function api<T = unknown>(path: string, opts: IApiOptions = {}): Promise<T>
{
    const headers: Record<string, string> = { ...opts.headers }
    const token = getToken()
    if(opts.auth !== false && token != null)
        headers.Authorization = `Bearer ${token}`

    const init: RequestInit = { method: opts.method ?? 'GET', headers, signal: opts.signal }
    if(opts.body !== undefined)
    {
        if(opts.body instanceof FormData)
            //* FormData 必须交由浏览器生成 multipart boundary, 手动 Content-Type 会破坏分隔符.
            init.body = opts.body
        else
        {
            headers['Content-Type'] = 'application/json'
            init.body = JSON.stringify(opts.body)
        }
    }

    const res = await fetch(path, init)
    if(res.status === 401)
    {
        //* 会话级失效: 每次请求恰好广播一次, 随后仍以 ApiError 拒绝, 让调用方自行提示.
        unauthorizedHandler?.()
        throw new ApiError(res.status, '登录状态已失效, 请重新登录')
    }

    //! 网关错误页可能不是 JSON: 解析失败降级为携带 HTTP 状态码的 ApiError, 而非裸 SyntaxError.
    const payload = await res.json().catch(() => null) as ApiResponse<T> | null
    if(payload == null || typeof payload.code !== 'number')
        throw new ApiError(res.status, `请求失败 (HTTP ${res.status})`)
    if(payload.code !== 0)
        throw new ApiError(payload.code, payload.message)
    return payload.data as T
}
