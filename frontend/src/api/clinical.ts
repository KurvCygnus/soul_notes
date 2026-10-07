//* 咨询员工作台域 API (后端 ClinicalResource 契约, COUNSELOR/ADMIN 专属): 风险队列 / 学生时间线 / 聚合统计.
//* 纯只读消费, 零写端点; 统一错误壳与 401 广播归 [[api]] (http.ts), 403 由视图层按 ApiError.code 降级.
import { api } from './http'
import type { AssessmentVo, RiskLevel, StatsSummary } from '../types'

//* 队列查询参数: level 空 = 全部; days 时间窗 (后端 @DefaultValue("7")); 分页与后端 PageRequest 同源 (第 1 页 20 条).
export interface IQueueParams
{
    level?: RiskLevel | null
    days?: number
    page?: number
    size?: number
}

//* 风险队列: 倒序分页列表 (排序语义在服务端, 前端只做防御性收口).
export async function listAssessments(params: IQueueParams = {}): Promise<AssessmentVo[]>
{
    const q = new URLSearchParams()
    if(params.level != null)
        q.set('level', params.level)
    q.set('days', String(params.days ?? 7))
    q.set('page', String(params.page ?? 1))
    q.set('size', String(params.size ?? 20))
    return api<AssessmentVo[]>(`/api/v1/clinical/assessments?${q.toString()}`)
}

//* 学生时间线: userId 必须是完整 UUID — 脱敏短码被后端 400 拒绝 ("学生 ID 非法"), 调用方 (视图层) 先判形再发.
export async function listStudentAssessments(userId: string, params: { page?: number; size?: number } = {}): Promise<AssessmentVo[]>
{
    const q = new URLSearchParams()
    q.set('page', String(params.page ?? 1))
    q.set('size', String(params.size ?? 20))
    return api<AssessmentVo[]>(`/api/v1/clinical/students/${encodeURIComponent(userId)}/assessments?${q.toString()}`)
}

//* 聚合统计: byLevel/byDay/totalStudents, days 为统计窗口天数.
export async function getStatsSummary(days = 7): Promise<StatsSummary>
{
    return api<StatsSummary>(`/api/v1/clinical/stats/summary?days=${days}`)
}
