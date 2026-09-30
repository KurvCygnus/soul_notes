//* 占位页 (spec §4.2): /profile 与 /about 的通用占位 — 页头 (页名) + 建设中空态, 正式内容随后续任务填充.
//* 页头/空态类名 (.view-header/.view-empty) 与设置页共用, 保证壳内二级页形态一致.
import type { ReactElement } from 'react'

export default function PlaceholderView({ title }: { title: string }): ReactElement
{
    return (
        <div className="placeholder-view">
            <header className="view-header">
                <h1>{title}</h1>
            </header>
            <p className="view-empty">建设中</p>
        </div>
    )
}
