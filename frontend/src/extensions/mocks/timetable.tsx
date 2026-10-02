//* Mock 课表扩展 (仅开发构建): 课表页 + 总览聚合卡, 外加同构简化的日程 Mock 页 (brief: 日程页同构简化, 不另立文件).
//* 页面组件只经 props.query 取数 (D11 查询隔离) — 类型上不存在任何会话能力注入通道;
//* 总览组件无 props 通道 (ComponentType), 是唯一例外形态: 直连只读 context api, 同样零会话引用.
//* 注: brief 原写总览头图标为 grid, IconName 词表无此字形 — 就近取 gauge (仪表盘 → 总览), 不为 Mock 扩充平台图标词表.
//region import
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { getContextSummary } from '../../api/context'
import type { ContextSummary } from '../../types'
import { ExtCard, ExtEmpty, ExtListRow, ExtLoading, ExtPageHeader } from '../helpers'
import type { IExtensionPageProps } from '../types'
//endregion

//* 取数状态机: loading/ready/error 三相 — Mock 无重试, 失败静默降级为空态文案, 避免未处理 rejection 噪音.
type SummaryState =
    | { phase: 'loading' }
    | { phase: 'ready'; data: ContextSummary }
    | { phase: 'error' }

//* 共享取数 hook: 初值即 loading, 异步分支只落 ready/error — effect 内不同步 setState (set-state-in-effect 禁令);
//* fetch 进依赖数组, 调用方传引用稳定的取数函数, 重复执行仅是重新取数, 无需中途复位 loading.
function useContextSummary(fetch: () => Promise<ContextSummary>): SummaryState
{
    const [state, setState] = useState<SummaryState>({ phase: 'loading' })
    useEffect(() =>
    {
        let alive = true
        fetch().then(
            data =>
            {
                if(alive)
                    setState({ phase: 'ready', data })
            },
            () =>
            {
                //! 取数失败不区分网络/后端形态: Mock 只求不白屏不报错, 真实错误排查靠浏览器网络面板.
                if(alive)
                    setState({ phase: 'error' })
            }
        )
        return () => { alive = false }
    }, [fetch])
    return state
}

//* 三相正文的公共骨架: 条目列表或空态, 各页只供数据与文案 — 复用而非每页重写三元嵌套.
function ExtSummaryBody<T>({ state, items, emptyText, row }: {
    state: SummaryState
    items: T[]
    emptyText: string
    row: (item: T) => ReactElement
}): ReactElement
{
    if(state.phase === 'loading')
        return <ExtLoading />
    if(state.phase === 'error' || items.length === 0)
        return <ExtEmpty text={state.phase === 'error' ? '暂时取不到数据, 稍后再来看看' : emptyText} />
    return <>{items.map(row)}</>
}

//region 课表页
export function MockTimetablePage({ query }: IExtensionPageProps): ReactElement
{
    const state = useContextSummary(query.context)
    return (
        <>
            <ExtPageHeader icon="calendar" title="课表" badge="Mock" />
            <ExtSummaryBody
                state={state}
                items={state.phase === 'ready' ? state.data.schedule : []}
                emptyText="今天没有课程安排"
                row={item => (
                    <ExtListRow
                        key={`${item.timeRange}-${item.course}`}
                        left={`${item.course} · ${item.location}`}  //* 课程名在左 (阅读主体), 时间右对齐 — 与总览页行序一致, 右对齐长文本会产生锯齿左缘 (走查实测).
                        right={item.timeRange}
                    />
                )}
            />
        </>
    )
}
//endregion

//region 总览 (校园风味聚合: 课表摘要 + 近期日程 + 近期考试)
export function MockTimetableOverview(): ReactElement
{
    const state = useContextSummary(getContextSummary)
    const data = state.phase === 'ready' ? state.data : null
    return (
        <>
            <ExtPageHeader icon="gauge" title="总览" />
            <ExtCard title="今日课表摘要">
                <ExtSummaryBody
                    state={state}
                    items={data?.schedule ?? []}
                    emptyText="暂无课程"
                    row={item => <ExtListRow key={`${item.course}-${item.timeRange}`} left={item.course} right={item.timeRange} />}
                />
            </ExtCard>
            <ExtCard title="近期日程">
                <ExtSummaryBody
                    state={state}
                    items={data?.agenda ?? []}
                    emptyText="暂无近期安排"
                    row={item => <ExtListRow key={`${item.date}-${item.title}`} left={item.title} right={item.date} />}
                />
            </ExtCard>
            <ExtCard title="近期考试">
                <ExtSummaryBody
                    state={state}
                    items={data?.exams ?? []}
                    emptyText="暂无考试安排"
                    row={item => <ExtListRow key={item.name} left={item.name} right={`${item.date} · ${item.daysUntil} 天后`} />}
                />
            </ExtCard>
        </>
    )
}
//endregion

//region 日程页 (同构简化: 只列议程条目)
export function MockAgendaPage({ query }: IExtensionPageProps): ReactElement
{
    const state = useContextSummary(query.context)
    return (
        <>
            <ExtPageHeader icon="calendar" title="日程" badge="Mock" />
            <ExtSummaryBody
                state={state}
                items={state.phase === 'ready' ? state.data.agenda : []}
                emptyText="暂无近期安排"
                row={item => (
                    <ExtListRow
                        key={`${item.date}-${item.title}`}
                        left={item.title}
                        right={item.note === '' ? item.date : `${item.date} · ${item.note}`}
                    />
                )}
            />
        </>
    )
}
//endregion
