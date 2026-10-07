//* 浮层返回哨兵协议 (spec §5.2, D8): 有浮层在场时 history 里压一个哨兵 entry, 系统返回键
//* (壳 goBack / 浏览器返回) 触发 popstate 而非退 SPA 路由 — 消费方据此关最上层浮层.
//* 关闭的触发源 (按钮/Escape/遮罩/popstate) 一律走组件既有 close 路径, 计数由 AppShell 派生
//* 驱动 opened/closed, 双向不撞车: 程序化 back 与 popstate 是同一历史事件的两侧.
let sentinel = 0  //* 在场哨兵数 (0 或 1 — 栈内只压一个, 浮层数量增减不重复压栈)

//* 哨兵 entry 的 history.state 标记 (opened pushState 写入, closed 收栈前读取).
interface ISentinelState
{
    soulOverlay?: boolean
}

export function overlayOpened(): void
{
    if(sentinel > 0)
        return
    sentinel = 1
    history.pushState({ soulOverlay: true }, '')
}

export function overlayClosed(): void
{
    if(sentinel === 0)
        return
    sentinel = 0
    //* 只在哨兵 entry 仍在栈顶时才 back 收栈; 两种例外必须跳过 (否则 back 落点是真路由, 误退用户页面):
    //* 1) popstate 收栈 (用户按返回键关浮层) — 哨兵已被该次遍历消费, 再 back 会多退一层;
    //* 2) 关浮层与程序化导航同拍 (如菜单项 "设置" 收菜单 + navigate) — 哨兵被 router 压栈盖在下面,
    //!    此时哨兵 entry 滞留为陈旧层, 由其后下一次 pushState 或后续返回遍历自然消化, 无需在此补救.
    const state = window.history.state as ISentinelState | null
    if(state?.soulOverlay !== true)
        return
    history.back()  //* 收回哨兵; 随之而来的 popstate 由 handler 层按"无浮层在场"忽略.
}

//* 哨兵 entry 修复重推 (评审闭环 Important-1/2): popstate 遍历消费了哨兵 entry 而模块变量仍为 1
//* (RED 在场持有计数, overlayOpened() 会 no-op) — 直接 pushState 补一个 entry, 变量语义不变 (仍 1).
//* 消费与重推一一对应: 每次返回遍历吃掉一个 entry, popstate 落点即补回一个, RED 展示期返回恒无效.
export function overlayResync(): void
{
    history.pushState({ soulOverlay: true }, '')
}

export function sentinelActive(): boolean
{
    return sentinel > 0
}

//* popstate 订阅: 返回 handler 的注销函数 (AppShell effect cleanup 同形).
export function onOverlayPopstate(handler: () => void): () => void
{
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
}
