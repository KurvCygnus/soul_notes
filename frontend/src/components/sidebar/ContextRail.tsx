//* 情境卡组 (Task 12): 侧栏"你的情境"区 — 今日课表卡 + 近期安排卡 (考试/日程), 系统集成能力的可见落点.
//* 数据经 [[getContextSummary]] 自加载: adapter=none 时三数组全空 → 整区隐藏 (自动静默); 请求失败 (含 401)
//* 同样隐藏且不重试 (fail-silent, 无死循环). 卡片点击经 onAsk 唤起聊天 — 壳把回调焊到 ChatView 的发送通道上,
//* 本组件不感知路由与门 (与 Sidebar 的纯 props 分层一致). 考试临近强调只用琥珀令牌, 不做医疗化/恐慌化表述.
import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { getContextSummary } from '../../api/context'
import type { ContextSummary, ExamItem } from '../../types'

//* 点击卡片注入聊天的固定话术 (半角标点, 与任务契约逐字一致); 导出供测试与壳层共用同一事实.
export const ASK_SCHEDULE = '帮我看看今天的课'
export const ASK_EXAMS = '快要考试了, 帮我梳理一下复习节奏'

export interface IContextRailProps
{
    //* 缺省时卡片退化为纯展示 (向后兼容不接聊天通道的旧调用方, 同 Sidebar 会话项的开关模式).
    onAsk?(q: string): void
}

//* 后端 NON_NULL 序列化可能缺省空数组, data 壳解包后的 null 也可能以 T 形态混入: 统一归一化, 消费端零判空分支.
function asList<T>(v: T[] | null | undefined): T[]
{
    return Array.isArray(v) ? v : []
}

//* 考试倒计时表述: 今天/明天有专名, 其余按"N 天后" (直接消费后端 daysUntil, 不在前端解析 date 字符串 —
//* 规避 new Date('yyyy-MM-dd') 按 UTC 零点解析的时区坑).
function examCountdown(daysUntil: number): string
{
    if(daysUntil <= 0)
        return '今天'
    if(daysUntil === 1)
        return '明天'
    return `${daysUntil} 天后`
}

//* 考试临近判定: 后端 daysUntil <= 7 染琥珀 (近期安排卡的强调令牌), 远期考试平铺展示.
function isExamSoon(exam: ExamItem): boolean
{
    return exam.daysUntil <= 7
}

export default function ContextRail({ onAsk }: IContextRailProps): ReactElement
{
    const [summary, setSummary] = useState<ContextSummary | null>(null)

    //* 挂载即拉取一次: alive 旗标拦截卸载后的迟到回调 (折叠侧栏/登出即卸载, 无陈旧 setState).
    useEffect(() =>
    {
        let alive = true
        getContextSummary().
            then(s => { if(alive && s != null) setSummary(s) }).
            catch(() => {})  //! 任何失败 (401/网络/后端故障) 或 data 缺席 (null) 都静默整区隐藏: 情境卡是增强项, 绝不阻塞聊天主路径.
        return () => { alive = false }
    }, [])

    const schedule = asList(summary?.schedule)
    const exams = asList(summary?.exams)
    const agenda = asList(summary?.agenda)
    if(schedule.length === 0 && exams.length === 0 && agenda.length === 0)
        return <></>  //* 三数组全空 (含加载中/失败): 整区连同标题一起消失, 不留空壳占位.

    //* 卡片渲染收口: onAsk 在位渲染按钮 (可点唤起聊天), 缺省渲染同构 div (纯展示); 内容全部为短语级
    //* span (button 的合法内容模型), 块状外观交给 CSS.
    function renderCard(clickable: boolean, onActivate: () => void, children: ReactNode): ReactElement
    {
        if(!clickable)
            return <div className="context-card">{children}</div>
        return <button type="button" className="context-card" onClick={onActivate}>{children}</button>
    }

    return (
        <section aria-label="你的情境区">
            <h2 className="sidebar-title">你的情境</h2>
            <div className="context-rail">
                {schedule.length > 0 && renderCard(onAsk != null, () => onAsk?.(ASK_SCHEDULE), (
                    <>
                        <span className="context-card-title">今日课表</span>
                        {schedule.map(s => (
                            <span key={`${s.course}@${s.timeRange}`} className="context-row">
                                <span className="context-row-main">{s.course}</span>
                                <span className="context-row-sub">{s.timeRange} · {s.location}</span>
                            </span>
                        ))}
                    </>
                ))}
                {(exams.length > 0 || agenda.length > 0) && renderCard(exams.length > 0 && onAsk != null, () => onAsk?.(ASK_EXAMS), (  //* 仅日程无考试时卡片不点 (话术以考试为锚), 纯展示 — 有意的不对称.
                    <>
                        <span className="context-card-title">近期安排</span>
                        {exams.map(ex => (
                            <span key={`${ex.name}@${ex.date}`} className={isExamSoon(ex) ? 'context-row context-soon' : 'context-row'}>
                                <span className="context-row-main">{ex.name}</span>
                                <span className="context-row-sub">
                                    <span className="context-exam-days">{examCountdown(ex.daysUntil)}</span> · {ex.location}
                                </span>
                            </span>
                        ))}
                        {agenda.map(a => (
                            <span key={`${a.title}@${a.date}`} className="context-row">
                                <span className="context-row-main">{a.title}</span>
                                <span className="context-row-sub">{a.date}{a.note === '' ? '' : ` · ${a.note}`}</span>
                            </span>
                        ))}
                    </>
                ))}
            </div>
        </section>
    )
}
