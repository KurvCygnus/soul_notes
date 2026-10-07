//* 咨询员工作台 (控制台, 标准 CRUD 形态): 三视图 tab — 风险队列 / 学生时间线 / 聚合统计, 数据全部来自
//* ClinicalResource 真实端点 (经 [[api/clinical]]). 门禁分层: 路由层 (<RequireRole> in App.tsx) 挡非
//* COUNSELOR/ADMIN 的渲染入口; 端点层 403 (令牌角色不符/越权) 在此整页降级为无权限提示页 — 前端角色只是
//* 渲染门, 后端 @RolesAllowed 才是权限真相, 两层缺一不可.
//* 队列行点击就地展开该学生时间线 (事件列表: 时间/风险/标签/摘要); 脱敏短码学生无法回查 (时间线端点只收
//* UUID, 实测短码 400 "学生 ID 非法"), 就地降级文案不白发请求. "今日新增" 按本地日历日取 byDay 当日黄红
//* 合计 (与侧栏 [[relTime]] 同一日历日口径); byDay 可能含服务端时钟偏移的未来日期, 未命中即记 0.
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { ApiError } from '../api/http'
import { getStatsSummary, listAssessments, listStudentAssessments } from '../api/clinical'
import { relTime } from '../utils/relTime'
import type { AssessmentVo, RiskLevel, StatsSummary } from '../types'

//* 完整 UUID 判形 (时间线端点的合法入参): 短码/残缺 ID 一律就地提示, 不白发请求.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

//* 等级筛选项: null = 全部 (level 查询参数整体缺席).
const LEVEL_OPTIONS: ReadonlyArray<{ value: RiskLevel | null; label: string }> = [
    { value: null, label: '全部' },
    { value: 'YELLOW', label: '黄色预警' },
    { value: 'RED', label: '红色预警' },
]

type TabKey = 'queue' | 'timeline' | 'stats'

//* 本地日历日键 (yyyy-MM-dd): "今日新增" 的命中口径, 与 byDay.date 的 ISO 日串同形.
function dayKey(d: Date): string
{
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${month}-${day}`
}

//* 风险徽标形态: RED 用 danger 令牌, YELLOW 用 amber 令牌, 未知等级回落中性描边 (wire 容错, 不崩渲染).
function badgeClass(level: string): string
{
    if(level === 'RED')
        return 'wb-badge wb-badge-red'
    if(level === 'YELLOW')
        return 'wb-badge wb-badge-yellow'
    return 'wb-badge'
}

function badgeLabel(level: string): string
{
    if(level === 'RED')
        return '红色'
    if(level === 'YELLOW')
        return '黄色'
    return level
}

//* 统一错误文案: ApiError 携带后端/HTTP 文案, 其余 (传输层意外) 兜底通用文案.
function errText(e: unknown): string
{
    return e instanceof ApiError ? e.message : '加载失败, 请稍后重试'
}

//* 403 判定: 端点级权限真相 — 命中即整页降级 (角色门禁的兜底层).
function isDenied(e: unknown): boolean
{
    return e instanceof ApiError && e.code === 403
}

//* 展开行/时间线 tab 共用的取数结果态: items 为 null 表示在途, error 非空即就地提示文案.
interface ITimelineState
{
    userId: string
    items: AssessmentVo[] | null
    error: string | null
}

//* 事件列表 (时间/风险/标签/摘要): 行内展开与时间线 tab 共用同一渲染形态.
function TimelineList({ items }: { items: AssessmentVo[] }): ReactElement
{
    return (
        <ul className="wb-timeline">
            {items.map(item =>
            {
                const tags = Array.isArray(item.tags?.tags) ? item.tags.tags : []
                return (
                    <li key={item.id} className="wb-event">
                        <span className={badgeClass(item.riskLevel)}>{badgeLabel(item.riskLevel)}</span>
                        <span className="wb-event-time">{relTime(item.createdAt)}</span>
                        {tags.map(tag => <span key={tag} className="wb-tag">{tag}</span>)}
                        <span className="wb-event-summary">{item.summary}</span>
                    </li>
                )
            })}
        </ul>
    )
}

export default function WorkbenchView(): ReactElement
{
    const [tab, setTab] = useState<TabKey>('queue')
    //* 403 整页降级: 一旦任一 clinical 端点回 403, 三视图整体退场 (权限真相不容许"半页可用"的假象).
    const [denied, setDenied] = useState(false)

    //region 队列视图状态
    const [level, setLevel] = useState<RiskLevel | null>(null)
    const [rows, setRows] = useState<AssessmentVo[] | null>(null)
    const [queueError, setQueueError] = useState<string | null>(null)
    //* 重查闸: 等级筛选拉同一 effect, 重试按钮靠 nonce 单调递增强制重跑 (重复点击也重新触发).
    const [reloadNonce, setReloadNonce] = useState(0)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [expandState, setExpandState] = useState<ITimelineState | null>(null)
    //endregion

    //region 时间线 tab 状态 (独立于行内展开: 输入 ID 主动查询)
    const [studentInput, setStudentInput] = useState('')
    const [tabState, setTabState] = useState<ITimelineState | null>(null)
    //endregion

    //region 统计视图状态
    const [stats, setStats] = useState<StatsSummary | null>(null)
    const [statsError, setStatsError] = useState<string | null>(null)
    //endregion

    //* 队列取数: 挂载与 level/reloadNonce 变化时重查; 竞态用 alive 旗挡旧响应回灌 (AppShell 同款口径).
    useEffect(() =>
    {
        let alive = true
        listAssessments({ level, days: 7, page: 1, size: 20 }).
            then(list => { if(alive) setRows(list) }).
            catch((e: unknown) =>
            {
                if(!alive)
                    return
                if(isDenied(e))
                {
                    setDenied(true)
                    return
                }
                setQueueError(errText(e))
            })
        return () => { alive = false }
    }, [level, reloadNonce])

    //* 统计取数: 每次进入统计 tab 重查 (旧值在途间照常展示, 不闪空白); 离开 tab 不再发请求.
    useEffect(() =>
    {
        if(tab !== 'stats')
            return
        let alive = true
        getStatsSummary(7).
            then(vo => { if(alive) setStats(vo) }).
            catch((e: unknown) =>
            {
                if(!alive)
                    return
                if(isDenied(e))
                {
                    setDenied(true)
                    return
                }
                setStatsError(errText(e))
            })
        return () => { alive = false }
    }, [tab])

    //* 队列排序 (防御性收口): 后端已按 createdAt 倒序, 前端再排序一次保证乱序回包不破时序语义; 非法时间按 0 沉底.
    const sortedRows = useMemo(() =>
    {
        if(rows == null)
            return null
        return [...rows].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    }, [rows])

    //* 行点击展开/收起: 展开即拉该学生时间线; 短码学生直接落降级文案 (端点只收 UUID, 不白发 400 请求).
    const toggleExpand = (row: AssessmentVo): void =>
    {
        if(expandedId === row.id)
        {
            setExpandedId(null)
            setExpandState(null)
            return
        }
        setExpandedId(row.id)
        if(!UUID_RE.test(row.userId))
        {
            setExpandState({ userId: row.userId, items: null, error: '该学生标识为脱敏短码, 暂无法回查时间线' })
            return
        }
        setExpandState({ userId: row.userId, items: null, error: null })
        listStudentAssessments(row.userId).
            then(list =>
            {
                //* userId 守卫: 换行展开后旧请求才回来时不得覆盖新行的在途态.
                setExpandState(prev => (prev != null && prev.userId === row.userId ? { userId: row.userId, items: list, error: null } : prev))
            }).
            catch((e: unknown) =>
            {
                if(isDenied(e))
                {
                    setDenied(true)
                    return
                }
                setExpandState(prev => (prev != null && prev.userId === row.userId ? { userId: row.userId, items: null, error: errText(e) } : prev))
            })
    }

    //* 时间线 tab 查询: 非法 ID 就地提示; 合法才发请求 (新旧查询同样用 userId 守卫防旧响应回灌).
    const queryTimeline = (): void =>
    {
        const id = studentInput.trim()
        if(!UUID_RE.test(id))
        {
            setTabState({ userId: '', items: null, error: '请输入完整的学生 ID (UUID)' })
            return
        }
        setTabState({ userId: id, items: null, error: null })
        listStudentAssessments(id).
            then(list => setTabState(prev => (prev != null && prev.userId === id ? { userId: id, items: list, error: null } : prev))).
            catch((e: unknown) =>
            {
                if(isDenied(e))
                {
                    setDenied(true)
                    return
                }
                setTabState(prev => (prev != null && prev.userId === id ? { userId: id, items: null, error: errText(e) } : prev))
            })
    }

    if(denied)
        return (
            <div className="workbench-view">
                <header className="view-header">
                    <h1>工作台</h1>
                </header>
                <div className="wb-denied card" role="alert">
                    <p className="wb-denied-title">无权访问咨询员工作台</p>
                    <p className="wb-hint">当前账号没有咨询员权限, 请联系管理员开通后重试.</p>
                </div>
            </div>
        )

    //* 统计派生值 (容错归一): 壳桩/异常回包可能缺键, 逐项回落 0, 数字卡永不 NaN.
    const byLevel = stats?.byLevel ?? {}
    const byDay = Array.isArray(stats?.byDay) ? stats.byDay : []
    const totalStudents = stats?.totalStudents ?? 0
    const totalCount = Object.values(byLevel).reduce((sum, n) => sum + (Number(n) || 0), 0)
    const today = byDay.find(entry => entry.date === dayKey(new Date()))
    const todayCount = (Number(today?.yellow) || 0) + (Number(today?.red) || 0)

    return (
        <div className="workbench-view">
            <header className="view-header">
                <h1>工作台</h1>
            </header>
            <div className="wb-tabs" role="tablist" aria-label="工作台视图">
                <button type="button" role="tab" aria-selected={tab === 'queue'} className="wb-tab" onClick={() => setTab('queue')}>风险队列</button>
                <button type="button" role="tab" aria-selected={tab === 'timeline'} className="wb-tab" onClick={() => setTab('timeline')}>学生时间线</button>
                <button type="button" role="tab" aria-selected={tab === 'stats'} className="wb-tab" onClick={() => setTab('stats')}>聚合统计</button>
            </div>

            {tab === 'queue' && (
                <section className="wb-panel" aria-label="风险队列">
                    <div className="wb-toolbar" role="group" aria-label="等级筛选">
                        {LEVEL_OPTIONS.map(opt => (
                            <button
                                key={opt.label}
                                type="button"
                                className="wb-filter"
                                aria-pressed={level === opt.value}
                                onClick={() => { setQueueError(null); setLevel(opt.value) }}//* 重查前清旧错误: 失败态不跨筛选滞留.
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {queueError != null ? (
                        <div className="wb-empty">
                            <p className="wb-empty-text">{queueError}</p>
                            <button type="button" className="wb-retry" onClick={() => { setQueueError(null); setReloadNonce(n => n + 1) }}>重试</button>
                        </div>
                    ) : sortedRows == null ? (
                        <p className="wb-hint">加载中...</p>
                    ) : sortedRows.length === 0 ? (
                        <div className="wb-empty">
                            <p className="wb-empty-text">暂无风险评估记录</p>
                            <p className="wb-hint">统计窗口期内没有新的风险评估产生</p>
                        </div>
                    ) : (
                        <table className="wb-table">
                            <thead>
                                <tr><th>风险等级</th><th>学生</th><th>时间</th><th>摘要</th></tr>
                            </thead>
                            <tbody>
                                {sortedRows.map(row =>
                                {
                                    const expanded = expandedId === row.id && expandState != null && expandState.userId === row.userId
                                    return (
                                        <Fragment key={row.id}>
                                            <tr className="wb-row" data-assessment-id={row.id} onClick={() => toggleExpand(row)}>
                                                <td><span className={badgeClass(row.riskLevel)}>{badgeLabel(row.riskLevel)}</span></td>
                                                <td>{row.displayName}</td>
                                                <td className="wb-time">{relTime(row.createdAt)}</td>
                                                <td className="wb-summary">{row.summary}</td>
                                            </tr>
                                            {expanded && (
                                                <tr className="wb-expand">
                                                    <td colSpan={4}>
                                                        <p className="wb-expand-title">{row.displayName} 的评估时间线</p>
                                                        {expandState.error != null ? <p className="wb-hint">{expandState.error}</p> :
                                                            expandState.items == null ? <p className="wb-hint">时间线加载中...</p> :
                                                                expandState.items.length === 0 ? <p className="wb-hint">该学生暂无评估记录</p> :
                                                                    <TimelineList items={expandState.items} />}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </section>
            )}

            {tab === 'timeline' && (
                <section className="wb-panel" aria-label="学生时间线">
                    <div className="wb-query">
                        <label className="wb-query-label" htmlFor="wb-student-id">学生 ID</label>
                        <input
                            id="wb-student-id"
                            className="wb-input"
                            value={studentInput}
                            placeholder="学生 UUID"
                            onChange={e => setStudentInput(e.target.value)}
                        />
                        <button type="button" className="wb-retry" onClick={queryTimeline}>查询</button>
                    </div>
                    {tabState == null ? <p className="wb-hint">输入学生 ID 查询其评估时间线</p> :
                        tabState.error != null ? <p className="wb-hint">{tabState.error}</p> :
                            tabState.items == null ? <p className="wb-hint">时间线加载中...</p> :
                                tabState.items.length === 0 ? <p className="wb-hint">该学生暂无评估记录</p> :
                                    <TimelineList items={tabState.items} />}
                </section>
            )}

            {tab === 'stats' && (
                <section className="wb-panel" aria-label="聚合统计">
                    {statsError != null ? <p className="wb-hint">{statsError}</p> :
                        stats == null ? <p className="wb-hint">加载中...</p> :
                            <>
                                <div className="wb-cards">
                                    <div className="wb-card"><span className="wb-card-label">红色预警</span><span className="wb-card-num">{Number(byLevel.RED) || 0}</span></div>
                                    <div className="wb-card"><span className="wb-card-label">黄色预警</span><span className="wb-card-num">{Number(byLevel.YELLOW) || 0}</span></div>
                                    <div className="wb-card"><span className="wb-card-label">评估总数</span><span className="wb-card-num">{totalCount}</span></div>
                                    <div className="wb-card"><span className="wb-card-label">今日新增</span><span className="wb-card-num">{todayCount}</span></div>
                                </div>
                                <p className="wb-hint">统计窗口: 近 7 天, 覆盖学生 {totalStudents} 名</p>
                            </>}
                </section>
            )}
        </div>
    )
}
