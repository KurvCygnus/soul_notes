//* 每日总结「」行 (homepage-v2 Task 10): 输入区下的一行质性今日总结, 三态降级 —
//* 无总结/接口失败 → 整件不渲染 (fail-silent 连占位都不留, 不重试); 有总结 → 「content」暗行, 点击展开最近列表 popover.
//* 形态对齐 [[WeatherCapsule]] 的 popover 惯例: 质性文本 only (无数值化), document mousedown click-outside + cleanup,
//* 进场动效留给 Task 13 动效令牌统一接线, 此处零裸毫秒. 挂载点现居 App.tsx 的 ChatHero (composer 槽, 登录态限定),
//* Task 9 重接线后随 Composer 迁回 ChatView — 组件保持自包含, 不感知路由与认证.
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { getRecentSummaries } from '../../api/summary'
import { useDailySummary } from '../../hooks/useDailySummary'
import type { DailySummaryVo } from '../../types'

//* 最近列表条数: 与后端查询默认一致, 实际返回几条渲染几条 (上限由后端 limit 兜底).
const RECENT_LIMIT = 7

export default function DailySummaryLine(): ReactElement
{
    const summary = useDailySummary()
    const [open, setOpen] = useState(false)
    //* null = 取数中; [] = 取回为空/取数失败 (同漏斗): 两态在 popover 内分别落文案.
    const [recent, setRecent] = useState<DailySummaryVo[] | null>(null)
    const rootRef = useRef<HTMLDivElement | null>(null)

    //* 收起即清空列表态 (事件驱动置位, 不在 effect 内 setState): 重开时回落"取数中",
    //* 保证每次打开都取新鲜值, 不复读上次的缓存列表.
    const close = (): void =>
    {
        setOpen(false)
        setRecent(null)
    }

    //* popover 打开期间才取最近列表 (惰性): alive 守卫防竞态回写, 卸载/收起即弃.
    useEffect(() =>
    {
        if(!open)
            return
        let alive = true
        getRecentSummaries(RECENT_LIMIT).
            then(list => { if(alive) setRecent(list) }).
            catch(() =>
            {
                //! 取数失败不炸 popover: 与空列表同漏斗落"无可展示"文案, 行本体 (今日总结) 不受牵连.
                if(alive)
                    setRecent([])
            })
        return () => { alive = false }
    }, [open])

    //* click-outside 收起: open 期间挂 document mousedown, 根外按下即收; cleanup 保证收起/卸载时移除监听.
    useEffect(() =>
    {
        if(!open)
            return
        const onDocMouseDown = (e: MouseEvent): void =>
        {
            if(rootRef.current != null && !rootRef.current.contains(e.target as Node))
                close()
        }
        document.addEventListener('mousedown', onDocMouseDown)
        return () => { document.removeEventListener('mousedown', onDocMouseDown) }
    }, [open])

    if(summary == null)
        return <></>  //* 三态降级的"无/失败"态: 连占位都不留, 输入区保持素净.

    return (
        <div className="summary-line" ref={rootRef}>
            <button
                type="button"
                className="summary-line-trigger"
                aria-expanded={open}
                onClick={() => (open ? close() : setOpen(true))}
            >
                「{summary.content}」
            </button>
            {open && (
                <div className="summary-pop">
                    <p className="summary-pop-title">最近的每日总结</p>
                    {recent == null ? (
                        <p className="summary-pop-empty">正在取回最近的总结.</p>
                    ) : recent.length === 0 ? (
                        <p className="summary-pop-empty">还没有可展示的总结.</p>
                    ) : (
                        <ul className="summary-pop-list">
                            {recent.map(s => (
                                <li key={s.date} className="summary-pop-item">
                                    <span className="summary-pop-date">{s.date}</span>
                                    <p className="summary-pop-content">「{s.content}」</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
