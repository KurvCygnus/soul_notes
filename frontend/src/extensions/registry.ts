import { builtinExtensions } from './builtin'
import { mockExtensions } from './mocks'
import type { IExtensionPoint, IHomeChip } from './types'

//* 扩展注册表: 平台装配扩展的唯一入口. dev 构建全量摊入 mocks, prod 构建剔除
//* (D10 衍生约定: Mock 仅开发构建 — 决策引用勘正见 T3 评审; 字面量展开而非条件 push,
//* 让打包器在 prod 下对 mocks 子树做常量折叠 + 摇树).
export const extensions: IExtensionPoint[] = [...builtinExtensions, ...(import.meta.env.PROD ? [] : mockExtensions)]

//* id 线性查找: 注册表量级为个位数, Map 属过度设计.
export function findExtension(id: string): IExtensionPoint | undefined
{
    return extensions.find(e => e.id === id)
}

//* 总览提供者 = 第一个注册 overview 的扩展; 无提供者时为 undefined, 总览条目随之消失 (D9 运行期条件).
export const overviewProvider: IExtensionPoint | undefined = extensions.find(e => e.overview != null)

//* 主页 chips 摊平: 各扩展贡献依注册序追加 (限通用简单问题, D20);
//* 内置文案与上限收敛在消费侧 (Task 9 已落地: [[homeChips]].selectVisibleChips — 扩展在前/内置补位), 注册表只管扩展贡献.
export const homeChips: IHomeChip[] = extensions.flatMap(e => e.homeChips ?? [])
