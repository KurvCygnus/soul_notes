//* 扩展域 API 测试 (P3): 真实端点接线 — query 三页取数与 notify 开关写路径.
//* fetch 全局 stub (http.test 同款 ok() 壳), 只断言 方法/路径/体 的接线; 解包与错误语义归 http.test 辖内.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryExtension, setExtensionNotify } from './ext'

const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, message: 'ok', data }), { status: 200 })

describe('queryExtension / setExtensionNotify (扩展域端点接线)', () =>
{
    afterEach(() => vi.unstubAllGlobals())

    it('queryExtension: POST /api/v1/ext/{name}/query, args 即 JSON 体 (D11 查询契约)', async () =>
    {
        const fetchMock = vi.fn().mockResolvedValue(ok([{ course: '高等数学' }]))
        vi.stubGlobal('fetch', fetchMock)
        await expect(queryExtension('timetable', {})).resolves.toEqual([{ course: '高等数学' }])
        const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(input).toBe('/api/v1/ext/timetable/query')
        expect(init.method).toBe('POST')
        expect(init.body).toBe(JSON.stringify({}))
    })

    it('queryExtension: name 经 URI 编码 (防路径段注入), 缺省 args 落空对象体', async () =>
    {
        const fetchMock = vi.fn().mockResolvedValue(ok(null))
        vi.stubGlobal('fetch', fetchMock)
        await queryExtension('a/b')
        const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(input).toBe('/api/v1/ext/a%2Fb/query')
        expect(init.body).toBe(JSON.stringify({}))
    })

    it('setExtensionNotify: PUT /api/v1/ext/{name}/notify 体 {enabled}, 响应归一为 void (开关负载不消费)', async () =>
    {
        const fetchMock = vi.fn().mockResolvedValue(ok(null))
        vi.stubGlobal('fetch', fetchMock)
        await expect(setExtensionNotify('timetable', true)).resolves.toBeUndefined()
        const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(input).toBe('/api/v1/ext/timetable/notify')
        expect(init.method).toBe('PUT')
        expect(init.body).toBe(JSON.stringify({ enabled: true }))
    })
})
