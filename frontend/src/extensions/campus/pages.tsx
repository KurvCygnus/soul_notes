//* 校园扩展页 (P3 去 mock 转正): 课表/考试/日程三详情页 + 总览聚合卡 — 数据唯一来源是后端真实扩展端点
//* (查询经只读 [[queryExtension]], D11 查询隔离; DemoCampusData 全环境提供, 前端不再持有任何 mock 数据形态).
//* 页面与总览组件零 props 注入通道, 类型上不存在任何会话能力注入; 总览为三扩展 REST 并联自组聚合形状.
//* 总览头图标 grid (走查裁决 2026-10-03: 词表本有 grid 四宫格字形, 旧注 "词表无此字形" 系陈误, gauge 视觉歧义已纠正).
//region import
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { queryExtension } from '../../api/ext'
import type { AgendaItem, ExamItem, ScheduleItem } from '../../types'
import { ExtCard, ExtEmpty, ExtListRow, ExtLoading, ExtPageHeader } from '../helpers'
import { ExtNotifyToggle } from './NotifyToggle'
//endregion

//* 取数状态机: loading/ready/error 三相 — 无重试, 失败静默降级为空态文案, 避免未处理 rejection 噪音.
type ExtDataState<T> =
    | { phase: 'loading' }
    | { phase: 'ready'; data: T }
    | { phase: 'error' }

//* 共享取数 hook: 初值即 loading, 异步分支只落 ready/error — effect 内不同步 setState (set-state-in-effect 禁令);
//* fetch 进依赖数组, 调用方传引用稳定的取数函数, 重复执行仅是重新取数, 无需中途复位 loading.
function useExtData<T>(fetch: () => Promise<T>): ExtDataState<T>
{
    const [state, setState] = useState<ExtDataState<T>>({ phase: 'loading' })
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
                //! 取数失败不区分网络/后端形态: 只求不白屏不报错, 真实错误排查靠浏览器网络面板.
                if(alive)
                    setState({ phase: 'error' })
            }
        )
        return () => { alive = false }
    }, [fetch])
    return state
}

//* 三相正文的公共骨架: 条目列表或空态, 各页只供数据与文案 — 复用而非每页重写三元嵌套.
//* state 只取相位视图: 总览三卡共用单一聚合状态, 卡级数据经 items 投影, 无需按卡重铸状态形状.
//* ready 相的行列表统一包在 .ext-rows 横向滚动容器内 (移动端溢出核查): 扩展页无固定宽表格, 溢出向量是
//* 长副行与未来宽内容 — 外层 overflow-x 兜底窄屏滚动而非整页破版, 副行自身的换行交 CSS 优先消化.
function ExtSummaryBody<T>({ state, items, emptyText, row }: {
    state: { phase: 'loading' | 'ready' | 'error' }
    items: T[]
    emptyText: string
    row: (item: T) => ReactElement
}): ReactElement
{
    if(state.phase === 'loading')
        return <ExtLoading />
    if(state.phase === 'error' || items.length === 0)
        return <ExtEmpty text={state.phase === 'error' ? '暂时取不到数据, 稍后再来看看' : emptyText} />
    return <div className="ext-rows">{items.map(row)}</div>
}

//* 模块级取数函数: 引用稳定 (hook effect 依赖数组要求), 单一扩展一目一函数, 总览在其上三路并联.
const fetchTimetable = (): Promise<ScheduleItem[]> => queryExtension<ScheduleItem[]>('timetable', {})
const fetchAgenda = (): Promise<AgendaItem[]> => queryExtension<AgendaItem[]>('agenda', {})
const fetchExams = (): Promise<ExamItem[]> => queryExtension<ExamItem[]>('exams', {})

//* 总览聚合形状: 与退役的 /context/summary 负载等价 ({schedule, exams, agenda}), 既有三卡渲染零改动.
//* Promise.all 三路并联 — 任一路失败即整体落入 error 相 (三卡同步降级), 与旧单一聚合端点的失败语义一致.
const fetchOverview = (): Promise<{ schedule: ScheduleItem[]; exams: ExamItem[]; agenda: AgendaItem[] }> =>
    Promise.all([fetchTimetable(), fetchExams(), fetchAgenda()]).
        then(([schedule, exams, agenda]) => ({ schedule, exams, agenda }))

//region 课表页
export function TimetablePage(): ReactElement
{
    const state = useExtData(fetchTimetable)
    return (
        <>
            <ExtPageHeader icon="calendar" title="课表" />
            {/* 通知开关挂点 (P3): MVP 消费者 = 课表扩展 "上课前 15 分钟" 规则 (spec §2) —
                日程/考试未声明 notificationRules, 开关对无规则扩展是无意义的空档, 故只挂课表页. */}
            <ExtNotifyToggle name="timetable" />
            <ExtSummaryBody
                state={state}
                items={state.phase === 'ready' ? state.data : []}
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

//region 考试页 (P3 新增详情页: 旧 mock 形态只在总览卡露出, 转正后三页齐备)
export function ExamsPage(): ReactElement
{
    const state = useExtData(fetchExams)
    return (
        <>
            <ExtPageHeader icon="calendar" title="考试" />
            <ExtSummaryBody
                state={state}
                items={state.phase === 'ready' ? state.data : []}
                emptyText="暂无考试安排"
                row={item => (
                    <ExtListRow
                        key={item.name}
                        left={item.name}
                        right={`${item.date} · ${item.daysUntil} 天后`}
                    />
                )}
            />
        </>
    )
}
//endregion

//region 总览 (校园风味聚合: 课表摘要 + 近期日程 + 近期考试)
export function TimetableOverview(): ReactElement
{
    const state = useExtData(fetchOverview)
    const data = state.phase === 'ready' ? state.data : null
    return (
        <>
            {/* C1 双裁定: /extensions 收归 ADMIN 后页面语义转"扩展治理"视角 — 仅标题换治理文案,
                三卡聚合与取数链路 (数据渲染逻辑) 保留不动. */}
            <ExtPageHeader icon="grid" title="扩展治理" />
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
export function AgendaPage(): ReactElement
{
    const state = useExtData(fetchAgenda)
    return (
        <>
            <ExtPageHeader icon="calendar" title="日程" />
            <ExtSummaryBody
                state={state}
                items={state.phase === 'ready' ? state.data : []}
                emptyText="暂无近期安排"
                row={item => (
                    <ExtListRow
                        key={`${item.date}-${item.title}`}
                        left={item.title}
                        right={item.note == null || item.note === '' ? item.date : `${item.date} · ${item.note}`}  //* note 可 null (wire 契约), 空缺一律退回纯日期, 不得渲染 "null" 字面量.
                    />
                )}
            />
        </>
    )
}
//endregion
