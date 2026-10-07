import type { ApiResponse } from '../types'

//* localStorage 令牌键, 沿用旧应用约定.
export const TOKEN_KEY = 'soul.token'

//* API 基址: 安卓 assets 壳经构建期 VITE_API_BASE 注入 (跨域到后端); 纯 Web 部署为空串 = 同源相对路径 (行为不变, spec §5).
//* 尾斜杠归一, 防拼出 "//api" 形态.
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

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
 * 业务失败 (code != 0), HTTP 层失败与传输层故障 (网络中断/不可达) 均以 [[ApiError]] 拒绝, 401 额外广播全局回调.
 * code 符号约定: 负数 = 客户端/传输层故障 (网络故障恒为 -1), 正数 = 后端业务码或 HTTP 状态码.
 * 唯一例外: [[IApiOptions.signal]] 主动触发的 AbortError 原样透传, 供流式调用方区分"取消"与"故障".
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

    let res: Response
    try { res = await fetch(`${API_BASE}${path}`, init) }
    catch(e)
    {
        //* AbortError 是调用方经 opts.signal 主动取消 (流式场景), 必须原样透传以区分取消与故障.
        //* 按 name 判定而非 instanceof DOMException: 跨 realm (jsdom/Node/浏览器) 的 instanceof 不可靠.
        if(e instanceof Error && e.name === 'AbortError')
            throw e
        //! 网络中断/不可达时 fetch 抛裸 TypeError: 统一降级为 ApiError, 兑现离线安全网语义 (catch(ApiError) 不漏接).
        throw new ApiError(-1, '网络连接不可用, 请检查网络后重试')
    }
    if(res.status === 401)
    {
        //* 先解包业务壳: 免认证端点 (登录/注册) 的 401 携带后端业务文案 ("密码错误"/"用户不存在"),
        //* 一律替换成泛化文案会让错误密码看起来像会话失效 (走查实测误导).
        const payload = await res.json().catch(() => null) as ApiResponse<never> | null
        //* 会话级失效: 认证请求每次恰好广播一次, 随后仍以 ApiError 拒绝, 让调用方自行提示;
        //! 免认证端点 (auth=false) 的 401 是凭证错误而非会话失效, 广播会误触发全局登出链, 必须跳过.
        if(opts.auth !== false)
            unauthorizedHandler?.()
        throw new ApiError(payload != null && typeof payload.code === 'number' ? payload.code : res.status, payload?.message ?? '登录状态已失效, 请重新登录')
    }

    //! 网关错误页可能不是 JSON: 解析失败降级为携带 HTTP 状态码的 ApiError, 而非裸 SyntaxError.
    const payload = await res.json().catch(() => null) as ApiResponse<T> | null
    if(payload == null || typeof payload.code !== 'number')
        throw new ApiError(res.status, `请求失败 (HTTP ${res.status})`)
    if(payload.code !== 0)
        throw new ApiError(payload.code, payload.message)
    return payload.data as T
}
