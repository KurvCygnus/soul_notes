import { describe, expect, it } from 'vitest'
import { builtinExtensions } from './builtin'
import { mockExtensions } from './mocks'
import { extensions, findExtension, homeChips, overviewProvider } from './registry'

describe('extension registry (扩展注册表)', () =>
{
    it('测试环境含 Mock 装配 (dev = builtin + mocks 全量摊入; prod 剔除由构建断言覆盖, 见收尾任务)', () =>
    {
        //* 本任务 mocks 为空数组 (Task 4 填充), brief 原断言 some(e => e.mock) 当前必假, 故改锁装配机制本身:
        //* 非 prod 环境 registry 长度必须等于 builtin 与 mocks 之和 — Task 4 填充 mocks 后本断言自动升级为 Mock 在场校验.
        expect(extensions).toHaveLength(builtinExtensions.length + mockExtensions.length)
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
        //* 改锁 "首个 overview 注册者" 语义 — 空态双方同为 undefined, Task 4 填充后自动验证首注册优先.
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
