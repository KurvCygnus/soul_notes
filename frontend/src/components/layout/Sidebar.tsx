//* 左栏: 折叠 (48px 图标条) <-> 展开 (260px 内容区), 宽度数值来自产品规格, 颜色走设计令牌 (.sidebar 类).
//* 纯 props 驱动 (不读 Context, 便于无头测试): 壳仅对访客传 onOpenLogin, 故该 prop 在位即视为访客态 —
//* 会话区与"你的情境"区只对登录用户渲染 (产品裁决). 会话数据 Task 10 经壳接入, 本组件只渲染与回调.
//* Task 10 契约扩展: 新增可选 onOpenSession (点击会话项打开), 既有 prop 语义与缺省行为不变.
import { Link } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { ChatSessionVo } from '../../types'

//* 偏好键与取值归本组件所有, 壳只经它读初始形态 (AppShell 惰性还原).
export const SIDEBAR_PREF_KEY = 'soul.sidebar'

const WIDTH_COLLAPSED = 48
const WIDTH_EXPANDED = 260

export interface ISidebarProps
{
    collapsed: boolean
    onToggle(): void
    sessions?: ChatSessionVo[]
    onDeleteSession?(id: string): void
    //* Task 10 扩展: 提供时会话项变为可点按钮 (打开会话), 缺省保持纯展示 (向后兼容).
    onOpenSession?(id: string): void
    onOpenLogin?(): void
}

//* 删除是破坏性操作: 以原生 confirm 二次确认 (测试 mock 该方法断言门控), 拒绝即不动数据.
function requestDelete(session: ChatSessionVo, onDeleteSession?: (id: string) => void): void
{
    if(onDeleteSession == null)
        return
    if(window.confirm(`确定删除会话 "${session.preview}"?`))
        onDeleteSession(session.sessionId)
}

export default function Sidebar({ collapsed, onToggle, sessions, onDeleteSession, onOpenSession, onOpenLogin }: ISidebarProps): ReactElement
{
    const guest = onOpenLogin != null

    //* 折叠切换持久化: 先按当前形态计算去向再落盘, 壳据此翻转 React 态 (存储所有权在组件, 壳只管渲染).
    const handleToggle = (): void =>
    {
        localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? 'expanded' : 'collapsed')
        onToggle()
    }

    return (
        <aside className="sidebar" style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}>
            <button
                type="button"
                className="sidebar-toggle"
                aria-expanded={!collapsed}
                aria-controls="sidebar-body"
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                onClick={handleToggle}
            >
                {collapsed ? '☰' : '«'}
            </button>
            <div id="sidebar-body" className="sidebar-body">
                {collapsed ? (
                    guest && (
                        <button type="button" className="sidebar-mini" aria-label="登录 / 注册" onClick={onOpenLogin}>
                            登录
                        </button>
                    )
                ) : guest ? (
                    <>
                        <p className="sidebar-empty">登录后可同步会话与你的情境</p>
                        <button type="button" className="btn btn-primary" onClick={onOpenLogin}>登录 / 注册</button>
                    </>
                ) : (
                    <>
                        <section aria-label="会话区">
                            <h2 className="sidebar-title">会话</h2>
                            {sessions == null || sessions.length === 0 ? (
                                <p className="sidebar-empty">暂无会话</p>
                            ) : (
                                <ul className="sidebar-list">
                                    {sessions.map((s) => (
                                        <li key={s.sessionId} className="sidebar-item">
                                            {onOpenSession == null ? (
                                                <span className="sidebar-preview">{s.preview}</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="sidebar-preview sidebar-open"
                                                    onClick={() => onOpenSession(s.sessionId)}
                                                >
                                                    {s.preview}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="sidebar-del"
                                                aria-label={`删除会话: ${s.preview}`}
                                                onClick={() => requestDelete(s, onDeleteSession)}
                                            >
                                                ×
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        {/* 你的情境区: Task 12 接入课程/考试/日程聚合, 当前仅留标题与占位文案. */}
                        <section aria-label="你的情境区">
                            <h2 className="sidebar-title">你的情境</h2>
                            <p className="sidebar-empty">课程与考试提醒即将上线</p>
                        </section>
                    </>
                )}
            </div>
            <nav className="sidebar-nav" aria-label="页面导航">
                {/* 危机支持入口对访客同样可见: 公开路由是产品红线, 不设登录门. */}
                <Link className="sidebar-item" to="/crisis">
                    {collapsed ? 'SOS' : '危机支持'}
                </Link>
            </nav>
        </aside>
    )
}
