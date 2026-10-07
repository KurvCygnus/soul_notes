import { describe, expect, it } from 'vitest'
import { flipped, sectionRoute } from './sidebarSections'

describe('sidebarSections (手风琴状态机)', () =>
{
    it('点击任一节即展开该节 (互斥由单一状态值天然保证)', () =>
    {
        expect(flipped('sessions')).toBe('extensions')
        expect(flipped('extensions')).toBe('sessions')
    })
    it('节 -> 主区路由映射', () =>
    {
        expect(sectionRoute('sessions')).toBe('/')
        expect(sectionRoute('extensions')).toBe('/extensions')
    })
})
