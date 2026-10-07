import { builtinExtensions } from './builtin'
import { campusExtensions } from './campus'
import type { IExtensionPoint, IHomeChip } from './types'

//* 扩展注册表: 平台装配扩展的唯一入口. P3 去 mock 转正: 注册表不再分构建形态 —
//* 旧 "dev 摊入 mocks / prod 常量折叠剔除" 链已整体退役 (mocks 目录移除, prod 剔除断言改造为
//* check-prod-extensions 的正向在场断言), dev/prod 共用同一注册表, 数据一律查后端真实扩展端点.
export const extensions: IExtensionPoint[] = [...builtinExtensions, ...campusExtensions]

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
