//* 每日总结域 API: 今日总结 + 最近列表 (登录态, JWT 由 [[api]] 自动注入).
import { api } from './http'
import type { DailySummaryVo } from '../types'

//* 形态守卫: data 缺席 (undefined)/null/数组 (网关 stub/坏代理)/字段缺失 一律视同"今日无总结" —
//* 消费方的三态降级只认 null, 绝不把坏形态渲染成「undefined」 (与 api/hotline 的 isUsable 同源思路).
function isUsableSummary(value: unknown): value is DailySummaryVo
{
    return typeof value === 'object' && value != null && !Array.isArray(value)
        && typeof (value as DailySummaryVo).date === 'string'
        && typeof (value as DailySummaryVo).content === 'string'
}

export async function getDailySummary(): Promise<DailySummaryVo | null>
{
    const data = await api<DailySummaryVo | null>('/api/v1/summary/daily')
    return isUsableSummary(data) ? data : null
}

export async function getRecentSummaries(limit: number): Promise<DailySummaryVo[]>
{
    const data = await api<DailySummaryVo[] | null>(`/api/v1/summary/recent?limit=${limit}`)
    //* 上限由后端 limit 兜底, 前端只过滤坏形态条目, 不二次裁剪 (返回几条渲染几条).
    return Array.isArray(data) ? data.filter(isUsableSummary) : []
}
