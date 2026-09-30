import { describe, expect, it } from 'vitest'
import { builtinExtensions } from './builtin'
import { mockExtensions } from './mocks'
import { extensions, findExtension, homeChips, overviewProvider } from './registry'

describe('extension registry (扩展注册表)', () =>
{
    it('测试环境含 Mock 装配 (dev = builtin + mocks 全量摊入; prod 剔除由构建断言覆盖, 见收尾任务)', () =>
    {
        //* 装配断言与 Mock 在场断言现已双双生效 (Task 4 已填充 mocks): 前者锁装配机制, 后者锁 mock 标注的归置契约.
        expect(extensions).toHaveLength(builtinExtensions.length + mockExtensions.length)
        expect(extensions.some(e => e.mock)).toBe(true)
    })
    it('Mock 条目全部带 mock 标注 (归置契约: 该标志即仅开发构建的识别依据, T3 评审裁决并入 T4)', () =>
    {
        expect(mockExtensions.every(e => e.mock)).toBe(true)
    })
    it('每个扩展点必有 id/name/icon/page', () =>
    {
        for(const e of extensions)
        {
            expect(e.id).toBeTruthy()
            expect(e.name).toBeTruthy()
            expect(e.icon).toBeTruthy()
            expect(e.page).toBeTruthy()
        }
    })
    it('总览提供者 = 第一个注册 overview 的扩展', () =>
    {
        //* 空注册表时 overviewProvider 必为 undefined (无提供者 = 总览条目消失, D9), brief 原断言 toBeTruthy 会误炸;
        //* 改锁 "首个 overview 注册者" 语义 — Task 4 已填充 mocks, 现在真实验证课表 Mock 首注册优先.
        const firstOverview = extensions.find(e => e.overview != null)
        expect(overviewProvider).toBe(firstOverview)
        if(firstOverview != null)
            expect(firstOverview.overview).toBeTruthy()
    })
    it('id 唯一', () =>
    {
        expect(new Set(extensions.map(e => e.id)).size).toBe(extensions.length)
    })
    it('findExtension 命中与未命中', () =>
    {
        expect(findExtension('no-such-ext')).toBeUndefined()
        const first = extensions[0]
        if(first != null)
            expect(findExtension(first.id)?.id).toBe(first.id)
    })
    it('主页 chips 摊平且每条含 label/question (内置文案链由 Task 9 前置合并)', () =>
    {
        for(const chip of homeChips)
        {
            expect(chip.label).toBeTruthy()
            expect(chip.question).toBeTruthy()
        }
    })
})
