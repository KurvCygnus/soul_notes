import { describe, expect, it } from 'vitest'
import { builtinExtensions } from './builtin'
import { campusExtensions } from './campus'
import { extensions, findExtension, homeChips, overviewProvider } from './registry'

describe('extension registry (扩展注册表)', () =>
{
    it('全构建同一注册表: extensions = builtin + campus (P3 去 mock 转正 — prod 剔除分支与 mocks 目录一并退役)', () =>
    {
        expect(extensions).toHaveLength(builtinExtensions.length + campusExtensions.length)
    })
    it('校园三扩展在场, id 与后端扩展名对齐 (详情路由 /extensions/:id 与 notify 端点同名复用)', () =>
    {
        expect(extensions.map(e => e.id)).toEqual(expect.arrayContaining(['timetable', 'exams', 'agenda']))
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
        //* 改锁 "首个 overview 注册者" 语义 — 课表扩展独占总览注册.
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
