//* 手风琴状态机 (D4): 两节互斥且必有一个展开 — 展开状态即单一 SidebarSection 值,
//* "点击另一节" 就是翻转状态; 节到主区路由的映射集中于此, 侧栏与壳共用.
export type SidebarSection = 'extensions' | 'sessions'

export function flipped(section: SidebarSection): SidebarSection
{
    return section === 'sessions' ? 'extensions' : 'sessions'
}

export function sectionRoute(section: SidebarSection): string
{
    return section === 'sessions' ? '/' : '/extensions'
}
