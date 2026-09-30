//* 内置主页 chips 文案集 + 可见性策略 (homepage-v2 Task 9, D25 用户裁决 2026-09-30):
//* 总可见上限 4 条; 排序 = 扩展贡献在前, 内置在后; 超限时从内置列表尾部开始丢弃 (内置可全部隐藏).
//* 上限值经用户确认可调 (实机走查复核) — 只动 HOME_CHIP_CAP, 策略语义不变.
//* 文案红线: 三条均是与 AI 倾听伙伴的通用简单情绪话题 (D20), 非医疗化, 不指向具体会话/数据查询.
import type { IHomeChip } from '../../extensions/types'

//* chips 总可见上限 (D25): 扩展贡献与内置合计的硬顶; 调整值须与用户复核.
export const HOME_CHIP_CAP = 4

//* 内置文案集 (D25 关口用户过目定稿): label 即候选题面, question 为点击直发的完整问题 (恒为聊天模式).
export const BUILTIN_CHIPS: IHomeChip[] = [
    { label: '和我聊聊今天的心情', question: '和我聊聊今天的心情' },
    { label: '我最近压力有点大', question: '我最近压力有点大' },
    { label: '帮我想想怎么放松', question: '帮我想想怎么放松' },
]

//* 可见性纯函数: 入参 = 注册表摊平的扩展贡献 ([[registry]] 的 homeChips), 出参 = 最终可见序列.
//* 从头补位 = 尾部先丢: 内置按原序填入剩余空位, 放不下即从尾部开始被丢, 内置永远让位于扩展贡献.
export function selectVisibleChips(extensionChips: IHomeChip[]): IHomeChip[]
{
    const visible = extensionChips.slice(0, HOME_CHIP_CAP)  //* 扩展贡献自身同样受上限约束, 且不 mutate 入参.
    for(const chip of BUILTIN_CHIPS)
    {
        if(visible.length >= HOME_CHIP_CAP)
            break
        visible.push(chip)
    }
    return visible
}
