//* 校园情境聚合 API: 课表/考试/日程一次拉齐, 供侧栏展示与 AI 情境注入 (system prompt) 消费.
import { api } from './http'
import type { ContextSummary } from '../types'

export const getContextSummary = (): Promise<ContextSummary> =>
    api<ContextSummary>('/api/v1/context/summary')
