//* 内置 chips 文案集与可见性策略测试 (homepage-v2 Task 9, D25 用户裁决):
//* 总可见上限 4 / 扩展贡献在前 / 内置在后 / 超限从内置列表尾部先丢 (内置可全部隐藏).
//* 纯函数桩测: 不引 React, 不触注册表 (registry 摊平的 homeChips 由 [[registry.test]] 覆盖).
import { describe, expect, it } from 'vitest'
import { BUILTIN_CHIPS, HOME_CHIP_CAP, selectVisibleChips } from './homeChips'
import type { IHomeChip } from '../../extensions/types'

const chip = (label: string): IHomeChip => ({ label, question: `${label}?` })

const ext = (n: number): IHomeChip[] => Array.from({ length: n }, (_, i) => chip(`扩展${i + 1}`))

describe('homeChips (内置文案集, D25 关口已过目的三条)', () =>
{
    it('恰好三条且文案与裁决集逐字一致', () =>
    {
        expect(BUILTIN_CHIPS).toHaveLength(3)
        expect(BUILTIN_CHIPS.map(c => c.label)).
            toEqual(['和我聊聊今天的心情', '我最近压力有点大', '帮我想想怎么放松'])
        for(const c of BUILTIN_CHIPS)
        {
            expect(c.label).not.toBe('')
            expect(c.question).not.toBe('')  //* 直发完整问题 (D20: 限通用简单问题).
        }
    })
})

describe('selectVisibleChips (D25 可见性策略)', () =>
{
    it('零扩展贡献: 三条内置全亮 (顺序 = 内置列表原序)', () =>
    {
        expect(selectVisibleChips([])).toEqual(BUILTIN_CHIPS)
    })

    it('三条扩展: 扩展在前占满后仅容第一条内置 (3 + 1 = 上限 4), 其余内置从尾部丢弃', () =>
    {
        const visible = selectVisibleChips(ext(3))
        expect(visible).toHaveLength(4)
        expect(visible.slice(0, 3)).toEqual(ext(3))  //* 扩展贡献先位 (D25 排序).
        expect(visible[3]).toBe(BUILTIN_CHIPS[0])  //* 内置从头补位 => 被丢的是列表尾部.
    })

    it('六条扩展: 内置全部隐藏, 扩展自身也截到上限 (前 4 条)', () =>
    {
        const visible = selectVisibleChips(ext(6))
        expect(visible).toHaveLength(HOME_CHIP_CAP)
        expect(visible).toEqual(ext(4))
        expect(visible.some(c => BUILTIN_CHIPS.includes(c))).toBe(false)
    })

    it('一条扩展: 扩展在前, 内置按原序补满到上限 (1 + 3)', () =>
    {
        const visible = selectVisibleChips(ext(1))
        expect(visible).toEqual([ext(1)[0], ...BUILTIN_CHIPS])
    })

    it('纯函数纪律: 不 mutate 入参, 每次调用返回新数组', () =>
    {
        const input = ext(2)
        const snapshot = [...input]
        const first = selectVisibleChips(input)
        const second = selectVisibleChips(input)
        expect(input).toEqual(snapshot)
        expect(first).not.toBe(input)
        expect(first).not.toBe(second)  //* 引用独立: 消费方局部变动不会互串.
    })
})
