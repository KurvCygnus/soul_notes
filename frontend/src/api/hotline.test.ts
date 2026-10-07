//* 热线三级缓存测试 (离线安全网核心): 用例按降级链排列 — API 成功回写本地, API 失败落本地缓存,
//* 双灭落内置默认; 损坏缓存 (非法 JSON / 形态不符) 必须容错跳级. api/crisis 整体 mock, 不触网络.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import { getHotline } from './crisis'
import { DEFAULT_HOTLINE, getCachedHotline, HOTLINE_STORAGE_KEY } from './hotline'
import type { HotlineInfo } from '../types'

vi.mock('./crisis', () => ({ getHotline: vi.fn() }))

const API_INFO: HotlineInfo = {
    name: '校园心理中心热线',
    primary: '010-12345678',
    backup: '12355',
    message: '工作日 8:00-22:00',
    appointmentUrl: 'https://counsel.example.com/book',
}

describe('getCachedHotline (热线三级缓存)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('第一级 API 成功: 返回 API 数据并回写 localStorage (缓存刷新覆盖陈旧值)', async () =>
    {
        localStorage.setItem(HOTLINE_STORAGE_KEY, '{"primary":"stale-old-number"}')
        vi.mocked(getHotline).mockResolvedValue(API_INFO)
        await expect(getCachedHotline()).resolves.toEqual(API_INFO)
        expect(localStorage.getItem(HOTLINE_STORAGE_KEY)).toBe(JSON.stringify(API_INFO))
    })

    it('第二级 API 失败 (401): 落 localStorage 缓存取上次落盘的号码', async () =>
    {
        localStorage.setItem(HOTLINE_STORAGE_KEY, JSON.stringify(API_INFO))
        vi.mocked(getHotline).mockRejectedValue(new ApiError(401, '登录状态已失效'))
        await expect(getCachedHotline()).resolves.toEqual(API_INFO)
    })

    it('第三级 API 与 localStorage 全灭: 返回内置默认, 且函数自身绝不 reject (网络错也不抛)', async () =>
    {
        vi.mocked(getHotline).mockRejectedValue(new ApiError(-1, '网络连接不可用'))
        await expect(getCachedHotline()).resolves.toEqual(DEFAULT_HOTLINE)
        expect((await getCachedHotline()).primary).toBe('400-161-9995')
        expect((await getCachedHotline()).backup).toBe('12355')
    })

    it('API 成功但形态不符 (缺号码): 视同失败降级下一级, 且不把坏数据回写缓存', async () =>
    {
        localStorage.setItem(HOTLINE_STORAGE_KEY, JSON.stringify(API_INFO))
        vi.mocked(getHotline).mockResolvedValue({ ...API_INFO, primary: '' })//* 形态不符: 号码为空
        await expect(getCachedHotline()).resolves.toEqual(API_INFO)
    })

    it('缓存损坏 (非法 JSON): 容错跳级返回默认, 解析异常不冒泡', async () =>
    {
        localStorage.setItem(HOTLINE_STORAGE_KEY, '{not-valid-json')
        vi.mocked(getHotline).mockRejectedValue(new Error('offline'))
        await expect(getCachedHotline()).resolves.toEqual(DEFAULT_HOTLINE)
    })

    it('缓存形态不符 (合法 JSON 但缺号码): 拒绝渲染 undefined 号码, 落默认', async () =>
    {
        localStorage.setItem(HOTLINE_STORAGE_KEY, '"just-a-string"')
        vi.mocked(getHotline).mockRejectedValue(new Error('offline'))
        await expect(getCachedHotline()).resolves.toEqual(DEFAULT_HOTLINE)
    })
})
