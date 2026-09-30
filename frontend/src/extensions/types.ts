//* 扩展框架编译期契约 (D8/D10/D11): 平台只供给展示原语与只读查询, 扩展自渲染自己的页面.
import type { ComponentType } from 'react'
import type { IconName } from '../components/ui/Icon'
import type { ContextSummary } from '../types'

//* 扩展页面唯一能拿到的能力: 只读数据查询 (D11 — 类型上不存在任何会话/chat 注入).
export interface IExtensionQueryClient
{
    context(): Promise<ContextSummary>
}

export interface IHomeChip
{
    label: string
    question: string  //* 点击直发的完整问题文案 (限通用简单问题, D20)
}

export interface IExtensionPoint
{
    id: string
    name: string
    icon: IconName
    mock?: boolean  //* 行尾小字标注 + 仅开发构建打包
    page: ComponentType<IExtensionPageProps>  //* 编译期契约: 缺页面 = 类型错误 (D10)
    overview?: ComponentType  //* 总览槽位: 注册者存在时总览条目才渲染 (D9)
    homeChips?: IHomeChip[]  //* 主页 chips 插槽贡献 (限通用简单问题)
}

export interface IExtensionPageProps
{
    query: IExtensionQueryClient
}
