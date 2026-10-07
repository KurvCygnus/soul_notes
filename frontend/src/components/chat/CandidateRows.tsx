//* 候选追问幽灵行 (Task 8): 挂最新一条 AI 回复下方, 点击即以该行文本直发 (复用既有发送管线).
//* 行形态 = corner-down-left 入行标 (回车角标, "点击即发送" 的暗示) + 追问文本 + chevron 尾标;
//* 发丝线分隔 (--line 令牌) + 50ms 阶梯入场 (内联 animationDelay 下发, .cand-in 专用 keyframes).
//! SVG-first 纪律: 行内标识一律 Icon 组件手写 stroke SVG, 禁用 Unicode emoji (AGENTS.md UI 约定).
import type { ReactElement } from 'react'
import Icon from '../ui/Icon'

//* 阶梯入场的步长 (ms): 三条候选的延迟为 0/50/100 — 轻微错峰即可传达"逐条浮现", 过长显得拖沓.
const STAGGER_MS = 50

export interface ICandidateRowsProps
{
    items: string[]
    onPick(text: string): void
}

export default function CandidateRows({ items, onPick }: ICandidateRowsProps): ReactElement | null
{
    //* 空组整件不渲染: 无追问的轮次 (生成失败/存量消息) 不留空容器 (挂载点由 ChatStream 裁决角色).
    if(items.length === 0)
        return null
    return (
        <div className="cands" aria-label="候选追问">
            {items.map((text, i) => (
                <button
                    key={`${i}-${text}`}
                    type="button"
                    className="cand cand-in pressable"
                    style={{ animationDelay: `${i * STAGGER_MS}ms` }}
                    onClick={() => onPick(text)}
                >
                    <Icon name="corner-down-left" size={13} className="cand-lead" />
                    <span className="cand-text">{text}</span>
                    <Icon name="chevron" size={13} className="cand-tail" />
                </button>
            ))}
        </div>
    )
}
