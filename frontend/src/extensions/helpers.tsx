//* UI Helper Utils (D8): 平台供给扩展页面的全部展示原语, 与设计令牌同源 — 扩展侧禁止自造颜色/毫秒值.
//* 样式随本模块经 Vite 副作用导入 (helpers.css), 扩展页零额外接线; 非医学化文案基调由文案方保证, 原语只管形态.
import type { ReactElement, ReactNode } from 'react'
import Icon, { type IconName } from '../components/ui/Icon'
import './helpers.css'

export function ExtPageHeader({ icon, title, badge }: { icon: IconName; title: string; badge?: string }): ReactElement
{
    return (
        <div className="ext-page-header">
            <Icon name={icon} size={20} />
            <h2 className="ext-page-title">{title}</h2>
            {badge != null && <ExtBadge text={badge} />}
        </div>
    )
}

export function ExtListRow({ left, right }: { left: string; right?: string }): ReactElement
{
    return (
        <div className="ext-list-row">
            <span className="ext-list-main">{left}</span>
            {right != null && <span className="ext-list-sub">{right}</span>}
        </div>
    )
}

export function ExtCard({ title, children }: { title: string; children: ReactNode }): ReactElement
{
    return (
        <section className="ext-card">
            <h3 className="ext-card-title">{title}</h3>
            {children}
        </section>
    )
}

export function ExtEmpty({ text }: { text: string }): ReactElement
{
    return <p className="ext-empty">{text}</p>
}

export function ExtLoading(): ReactElement
{
    return <p className="ext-loading" role="status">加载中</p>
}

export function ExtBadge({ text }: { text: string }): ReactElement
{
    return <span className="ext-badge">{text}</span>
}
