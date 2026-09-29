//* 消息流渲染: 时间分组 ([[groupMessages]]) + 日期分隔条 + 气泡列表 + 滚动跟随.
//* 滚动策略: 内容"整体替换"(首条消息对象身份变化, 即打开会话/新对话/新对话首条)时强制回底;
//* 流式增量时仅当用户本就贴近底部才跟随 (阈值 80px) — 上翻阅读历史不被滚底打扰.
//* aria-live="polite": 新消息由读屏器以非抢占方式播报 (流式 token 高频, polite 避免打断).
import { Fragment, useEffect, useMemo, useRef } from 'react'
import type { ReactElement, UIEvent } from 'react'
import ChatBubble from './ChatBubble'
import { groupMessages } from '../../utils/group'
import type { IDisplayMessage, IMessageGroup } from '../../utils/group'

//* 距底不足该像素视为"用户在底部".
const NEAR_BOTTOM_PX = 80

export interface IChatStreamProps
{
    messages: IDisplayMessage[]
    streaming: boolean
}

type IMessageGroupWithStart = IMessageGroup & { start: number }

export default function ChatStream({ messages, streaming }: IChatStreamProps): ReactElement
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

    return (
        <div className="chat-stream" ref={scrollRef} aria-live="polite" onScroll={handleScroll}>
            {groups.map((g, gi) => (
                <Fragment key={`${gi}-${g.label}`}>
                    {g.label !== '' && <div className="chat-date">{g.label}</div>}
                    {g.items.map((m, i) => (
                        <ChatBubble
                            key={`${gi}-${i}`}
                            message={m}
                            streaming={streaming && g.start + i === messages.length - 1}
                        />
                    ))}
                </Fragment>
            ))}
        </div>
    )
}
