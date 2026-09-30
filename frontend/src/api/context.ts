//* 校园情境聚合 API: 课表/考试/日程一次拉齐, 供扩展页经 [[IExtensionQueryClient]] 只读取数 (D11 查询隔离).
import { api } from './http'
import type { ContextSummary } from '../types'

//* 形态守卫: 后端 NON_NULL 序列化可能缺省空数组, 网关 stub/坏代理也可能给出非对象形态 —
//* 三数组统一归一化后消费端 (扩展页) 零判空分支 (与 api/summary 的 isUsableSummary 同源思路;
//* ContextRail 退场后, 归一化职责从消费侧收拢到本模块唯一边界).
function asList<T>(v: T[] | null | undefined): T[]
{
    return Array.isArray(v) ? v : []
}

export async function getContextSummary(): Promise<ContextSummary>
{
    const data = await api<ContextSummary>('/api/v1/context/summary')
    return {
        schedule: asList(data?.schedule),
        exams: asList(data?.exams),
        agenda: asList(data?.agenda),
    }
}
