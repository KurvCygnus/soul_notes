//* 扩展框架编译期契约 (D8/D11): 平台只供给展示原语, 扩展自渲染自己的页面;
//* 取数唯一入口是只读 [[queryExtension]] (api/ext, D11 查询隔离 — 类型上不存在任何会话/chat 注入).
import type { ComponentType } from 'react'
import type { IconName } from '../components/ui/Icon'

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
    page: ComponentType  //* 编译期契约: 缺页面 = 类型错误 (D10); 页面无 props, 自取数
    overview?: ComponentType  //* 总览槽位: 注册者存在时总览条目才渲染 (D9)
    homeChips?: IHomeChip[]  //* 主页 chips 插槽贡献 (限通用简单问题)
}
