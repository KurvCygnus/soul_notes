//* 消息流渲染: 时间分组 ([[groupMessages]]) + 日期分隔条 + 气泡列表 + 滚动跟随.
//* 滚动策略: 内容"整体替换"(首条消息对象身份变化, 即打开会话/新对话/新对话首条)时强制回底;
//* 流式增量时仅当用户本就贴近底部才跟随 (阈值 80px) — 上翻阅读历史不被滚底打扰.
//* aria-live="polite": 新消息由读屏器以非抢占方式播报 (流式 token 高频, polite 避免打断).
//* 候选追问行 (Task 8): 仅挂最新一条 AI 回复下方 — 末条为 user (新一轮已发送) 时不渲染旧候选.
import { Fragment, useEffect, useMemo, useRef } from 'react'
import type { ReactElement, UIEvent } from 'react'
import ChatBubble from './ChatBubble'
import CandidateRows from './CandidateRows'
import { groupMessages } from '../../utils/group'
import type { IDisplayMessage, IMessageGroup } from '../../utils/group'

//* 距底不足该像素视为"用户在底部".
const NEAR_BOTTOM_PX = 80

export interface IChatStreamProps
{
    messages: IDisplayMessage[]
    streaming: boolean
    //* 候选追问 (Task 8): 渲染裁决在本组件 — 末条消息为 assistant 且 items 非空才挂 [[CandidateRows]].
    followups?: string[]
    onPickFollowup?(text: string): void
    //* 工具调用过程文案 (工具调用可见性): 流中 tool-call 事件的扩展自定义 label, 透传至流式末条
    //* [[ChatBubble]] 的思考指示; null/缺席 = 本轮无工具调用, 气泡回落 "思考中".
    toolLabel?: string | null
}

type IMessageGroupWithStart = IMessageGroup & { start: number }

export default function ChatStream({ messages, streaming, followups, onPickFollowup, toolLabel }: IChatStreamProps): ReactElement
{
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const nearBottomRef = useRef(true)
    const prevFirstRef = useRef<IDisplayMessage | null>(null)

    //* 分组并记录每组在扁平消息序列中的起始下标: 流式光标需按全局"最后一条"定位.
    const groups = useMemo<IMessageGroupWithStart[]>(() =>
    {
        const result: IMessageGroupWithStart[] = []
        let offset = 0
        for(const g of groupMessages(messages))
        {
            result.push({ ...g, start: offset })
            offset += g.items.length
        }
        return result
    }, [messages])

    useEffect(() =>
    {
        //* 先更新首条身份快照再判空: 即使容器尚未挂载也要维护, 否则首次挂载会被误判为"替换".
        const first = messages[0] ?? null
        const replaced = first !== prevFirstRef.current
        prevFirstRef.current = first
        const el = scrollRef.current
        if(el == null)
            return
        if(replaced || nearBottomRef.current)
            el.scrollTop = el.scrollHeight
    }, [messages])

    const handleScroll = (e: UIEvent<HTMLDivElement>): void =>
    {
        const el = e.currentTarget
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    }

    //* 候选行挂载裁决 (Task 8): 只认全局末条 — 它是 assistant 才有资格挂候选 (用户消息后/清屏态一律无);
    //* props 齐备性收敛进 narrowed 载荷: 渲染处免非空断言, items 空数组的整组缺席由 [[CandidateRows]] 兜底.
    const lastIndex = messages.length - 1
    const lastIsAssistant = lastIndex >= 0 && messages[lastIndex].role === 'assistant'
    const candidates = lastIsAssistant && followups != null && followups.length > 0 && onPickFollowup != null ?
        { items: followups, onPick: onPickFollowup } :
        null

    return (
        <div className="chat-stream" ref={scrollRef} aria-live="polite" onScroll={handleScroll}>
            {groups.map((g, gi) => (
                <Fragment key={`${gi}-${g.label}`}>
                    {g.label !== '' && <div className="chat-date">{g.label}</div>}
                    {g.items.map((m, i) => (
                        <Fragment key={`${gi}-${i}`}>
                            <ChatBubble
                                message={m}
                                streaming={streaming && g.start + i === lastIndex}
                                thinkingLabel={toolLabel}
                            />
                            {candidates != null && g.start + i === lastIndex && (
                                <CandidateRows items={candidates.items} onPick={candidates.onPick} />
                            )}
                        </Fragment>
                    ))}
                </Fragment>
            ))}
        </div>
    )
}
