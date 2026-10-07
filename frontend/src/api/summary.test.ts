//* 每日总结域 API 测试: 壳解包后的 data 双形态容忍 (对象在场 / null / 键缺席) 与坏形态守卫,
//* recent 的数组兜底与条目过滤; 网络/业务失败按契约原样 reject (降级由调用方完成). api 整体 mock, 不触网络.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './http'
import { getDailySummary, getRecentSummaries } from './summary'
import type { DailySummaryVo } from '../types'

vi.mock('./http', () => ({ api: vi.fn() }))

const mockApi = vi.mocked(api)

const VO: DailySummaryVo = { date: '2026-09-30', content: '今天你慢慢写下了心情.' }

describe('api/summary (每日总结域 API)', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks()
    })

    it('daily: data 为对象 (今日有总结) → 原样返回, 请求路径正确', async () =>
    {
        mockApi.mockResolvedValue(VO)
        await expect(getDailySummary()).resolves.toEqual(VO)
        expect(mockApi).toHaveBeenCalledWith('/api/v1/summary/daily')
    })

    it('daily: data 为 null (今日无总结) → resolve null', async () =>
    {
        mockApi.mockResolvedValue(null)
        await expect(getDailySummary()).resolves.toBeNull()
    })

    it('daily: data 键缺席 (undefined, NON_NULL 序列化) → resolve null', async () =>
    {
        mockApi.mockResolvedValue(undefined)
        await expect(getDailySummary()).resolves.toBeNull()
    })

    it('daily: data 坏形态 (数组/缺字段) → resolve null, 绝不让「undefined」上屏', async () =>
    {
        mockApi.mockResolvedValue([])
        await expect(getDailySummary()).resolves.toBeNull()
        mockApi.mockResolvedValue({ date: '2026-09-30' })  //* 缺 content
        await expect(getDailySummary()).resolves.toBeNull()
    })

    it('daily: 网络/业务失败按契约原样 reject (三态降级由调用方收口)', async () =>
    {
        mockApi.mockRejectedValue(new Error('offline'))
        await expect(getDailySummary()).rejects.toThrow('offline')
    })

    it('recent: 数组原样返回 (返回几条渲染几条), limit 拼进 query', async () =>
    {
        mockApi.mockResolvedValue([VO])
        await expect(getRecentSummaries(7)).resolves.toEqual([VO])
        expect(mockApi).toHaveBeenCalledWith('/api/v1/summary/recent?limit=7')
    })

    it('recent: data null/缺席 → 空数组兜底; 条目坏形态被过滤', async () =>
    {
        mockApi.mockResolvedValue(null)
        await expect(getRecentSummaries(7)).resolves.toEqual([])
        mockApi.mockResolvedValue(undefined)
        await expect(getRecentSummaries(7)).resolves.toEqual([])
        mockApi.mockResolvedValue([VO, { date: '2026-09-29' } as DailySummaryVo])  //* 第二条缺 content
        await expect(getRecentSummaries(7)).resolves.toEqual([VO])
    })
})
