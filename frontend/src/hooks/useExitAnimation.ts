//* 浮层退场动画簿记 (走查裁决 2026-10-03, 取代 "出场即时卸载"): open 翻假后组件续挂一轮退场动画,
//* animationend 或兜底定时器到达才真卸载 — 消费方: 根节点挂 .closing 类 + onAnimationEnd 里调 markExited.
//* open 翻真在渲染期同步派生 (React 认可的 props 派生态模式): 面板当轮即出, 焦点管理等同轮效果不落空.
//* 兜底定时器覆盖 animationend 永不到达的两条路径: prefers-reduced-motion 下全局动画被掐断 (base.css 总闸),
//* 与 jsdom 等无动画引擎; 时长从 --dur-fast 令牌现读, 与 CSS 零漂移, 解析失败按 0 (下一宏任务, 行为等同无动画即时卸载).
import { useCallback, useEffect, useState } from 'react'

export interface IExitAnimation
{
    mounted: boolean  //* 应否渲染 (true 含退场中的那一轮)
    closing: boolean  //* 退场动画进行中: 根节点据此挂 .closing (掐指针 + 播退场)
    markExited(): void  //* 退场动画结束回调 (onAnimationEnd 过滤 animationName === 'overlay-exit' 后调用)
}

interface IExitState
{
    open: boolean  //* 已消费的 open 快照 (渲染期派生的比对基准)
    mounted: boolean
    closing: boolean
}

export function useExitAnimation(open: boolean): IExitAnimation
{
    const [state, setState] = useState<IExitState>(() => ({ open, mounted: open, closing: false }))

    if(state.open !== open)
    {
        if(open)
            setState({ open, mounted: true, closing: false })  //* 重开竞态: 退场未结束又开 — 复用在场节点, 掐掉 closing.
        else if(state.mounted)
            setState({ open, mounted: true, closing: true })
        else
            setState({ ...state, open })  //* 已卸载再关: 幂等.
    }

    const markExited = useCallback(() => setState({ open: false, mounted: false, closing: false }), [])

    useEffect(() =>
    {
        if(!state.closing)
            return
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-fast')
        const ms = Number.parseFloat(raw)
        const timer = setTimeout(markExited, Number.isFinite(ms) ? ms : 0)
        return () => clearTimeout(timer)
    }, [state.closing, markExited])

    return { mounted: state.mounted, closing: state.closing, markExited }
}
