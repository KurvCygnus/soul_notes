//* 对话风格偏好域 API (端点由后端 Task 1 并行落地, 前端按契约先行): GET/PUT /api/v1/me/chat-style.
//* 登录态端点, JWT 由 [[api]] 自动注入; 读路径带形态守卫 (坏形态 resolve null, "全默认回显"由调用方承接),
//* 写路径全量五轴上送, 成功响应与请求体同形 (乐观更新与回滚由调用方承接, 响应一般不消费).
import { api } from './http'
import type { ChatStyleName, ChatStyleTrio, ChatStyleVo } from '../types'

//* 值域名单即守卫依据: 与 types.ts 的联合类型逐字对应, 两处必须同步修改.
const STYLES: readonly ChatStyleName[] = ['default', 'professional', 'friendly', 'direct', 'optimist', 'pragmatic', 'witty']
const TRIOS: readonly ChatStyleTrio[] = ['less', 'default', 'more']

//* 形态守卫: 非对象/数组 (网关 stub 常态)/缺字段/越界枚举一律不算可用 — 与 api/summary 的 isUsable 同源思路,
//* 绝不让坏形态直接灌进设置页分段控件 (includes 对越界串恒 false, cast 只为过签名, 无运行时副作用).
function isUsableChatStyle(value: unknown): value is ChatStyleVo
{
    if(typeof value !== 'object' || value == null || Array.isArray(value))
        return false
    const rec = value as Record<string, unknown>
    return STYLES.includes(rec.style as ChatStyleName)
        && TRIOS.includes(rec.warmth as ChatStyleTrio)
        && TRIOS.includes(rec.enthusiasm as ChatStyleTrio)
        && TRIOS.includes(rec.headings as ChatStyleTrio)
        && TRIOS.includes(rec.emoji as ChatStyleTrio)
}

export async function getChatStyle(): Promise<ChatStyleVo | null>
{
    const data = await api<ChatStyleVo | null>('/api/v1/me/chat-style')
    return isUsableChatStyle(data) ? data : null
}

export function putChatStyle(prefs: ChatStyleVo): Promise<ChatStyleVo>
{
    return api<ChatStyleVo>('/api/v1/me/chat-style', { method: 'PUT', body: prefs })
}
