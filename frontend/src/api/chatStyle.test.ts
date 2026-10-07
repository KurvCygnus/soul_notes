//* 对话风格偏好域 API 测试: 读路径形态守卫 (坏形态一律 resolve null, "全默认回显"由调用方承接),
//* 写路径 PUT 方法 + 全量五轴体上送; 网络/业务失败按契约原样 reject (降级由调用方完成). api 整体 mock, 不触网络.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './http'
import { getChatStyle, putChatStyle } from './chatStyle'
import type { ChatStyleVo } from '../types'

vi.mock('./http', () => ({ api: vi.fn() }))

const mockApi = vi.mocked(api)

const VO: ChatStyleVo = { style: 'witty', warmth: 'more', enthusiasm: 'less', headings: 'default', emoji: 'more' }

describe('api/chatStyle (对话风格偏好域 API)', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks()
    })

    it('getChatStyle: 可用形态原样返回, 请求路径正确', async () =>
    {
        mockApi.mockResolvedValue(VO)
        await expect(getChatStyle()).resolves.toEqual(VO)
        expect(mockApi).toHaveBeenCalledWith('/api/v1/me/chat-style')
    })

    it('getChatStyle: data null/缺席 (undefined) → resolve null', async () =>
    {
        mockApi.mockResolvedValue(null)
        await expect(getChatStyle()).resolves.toBeNull()
        mockApi.mockResolvedValue(undefined)
        await expect(getChatStyle()).resolves.toBeNull()
    })

    it('getChatStyle: 坏形态 (数组/缺字段/越界枚举) → resolve null, 绝不让坏值灌进分段控件', async () =>
    {
        mockApi.mockResolvedValue([])
        await expect(getChatStyle()).resolves.toBeNull()
        mockApi.mockResolvedValue({ style: 'witty' })  //* 缺四轴
        await expect(getChatStyle()).resolves.toBeNull()
        mockApi.mockResolvedValue({ ...VO, style: 'nasty' })  //* style 越界值域
        await expect(getChatStyle()).resolves.toBeNull()
        mockApi.mockResolvedValue({ ...VO, warmth: 'extreme' })  //* 轴档越界值域
        await expect(getChatStyle()).resolves.toBeNull()
    })

    it('getChatStyle: 网络/业务失败按契约原样 reject (降级由调用方收口)', async () =>
    {
        mockApi.mockRejectedValue(new Error('offline'))
        await expect(getChatStyle()).rejects.toThrow('offline')
    })

    it('putChatStyle: PUT 方法 + 全量五轴体上送, 响应原样透传', async () =>
    {
        mockApi.mockResolvedValue(VO)
        await expect(putChatStyle(VO)).resolves.toEqual(VO)
        expect(mockApi).toHaveBeenCalledWith('/api/v1/me/chat-style', { method: 'PUT', body: VO })
    })
})
