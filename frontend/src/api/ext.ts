//* 数据扩展查阅 (spec D8): args 即后端 A (JSON body), 返回 D (Jackson JSON); fail-open 由后端契约自持.
import { api } from './http'

//* 扩展页取数唯一入口: name 对应注册的扩展标识 (timetable/exams/agenda), 未知 name 走后端 404 外壳 → ApiError 拒绝.
export async function queryExtension<T>(name: string, args?: unknown): Promise<T>
{
    return api<T>(`/api/v1/ext/${encodeURIComponent(name)}/query`, { method: 'POST', body: args ?? {} })
}

//* 扩展通知开关 (P3, spec §2): 按用户×扩展写 Redis 开关 (TTL 永久, 默认关) — opt-in 后调度器才为其下发 ext-notification.
//* 契约仅写无读: 响应负载不消费, 归一为 void, 调用方只依赖请求成功/失败语义.
export function setExtensionNotify(name: string, enabled: boolean): Promise<void>
{
    return api<null>(`/api/v1/ext/${encodeURIComponent(name)}/notify`, { method: 'PUT', body: { enabled } }).then(() => undefined)
}
