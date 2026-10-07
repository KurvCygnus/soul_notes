//* 单条消息 (Task 3 A 案): 用户侧保持气泡纯文本 (用户输入不应被 Markdown 语法意外改写),
//* AI 侧去气泡 — 元信息行 (.msg-meta: 头像点 + "心灵伙伴" + HH:mm + 复制钮) + 正文容器 (.msg-body).
//* AI 非流式正文走 vendored md 渲染器 (parseMarkdown + renderMdDocument): 建树全程 createElement/textContent,
//! 零 innerHTML — 上游安全契约逐字保留禁改; 链接经内建 isSafeHref 白名单 (http/https/mailto), 其余降级纯文本.
//* 流式正文 (Task 4 重写): 纯文本分片化 — 每个到达片段包 .chunk-in span (入场动效一次, forwards 停终态),
//* 尾随 .caret-bar 品牌色光标条; 分片期不走 md 渲染, 流结束由 useLayoutEffect 转挂 kv-chat-md (无双重渲染).
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import Icon from '../ui/Icon'
import { toast } from '../../utils/toast'
import { parseMarkdown } from '../../utils/markdown/md-parser'
import { renderMdDocument } from '../../utils/markdown/md-render'
import type { IDisplayMessage } from '../../utils/group'

export interface IChatBubbleProps
{
    message: IDisplayMessage
    streaming?: boolean
    //* 工具调用过程文案 (工具调用可见性): 流中 tool-call 事件携带的扩展自定义 label (如 "正在查询课表…"),
    //* 流式等待窗口 (分片为空) 时替换思考指示的默认文本; 缺席/null = 本轮无工具调用, 回落 "思考中".
    thinkingLabel?: string | null
}

//* 流式分片台账单元: key 供 React 稳定 span 身份 (已到分片不重挂/不重放入场动效), text 为该片原文.
interface IStreamChunk
{
    key: number
    text: string
}

//* 分片台账: renderedLen 是上次渲染已切片的正文长度, nextKey 单调递增.
interface IStreamLedger
{
    chunks: IStreamChunk[]
    renderedLen: number
    nextKey: number
}

//* 空台账/空分片哨兵 (复用同一实例, 免每次渲染新数组): 分片仅在流式窗口有意义.
const EMPTY_LEDGER: IStreamLedger = { chunks: [], renderedLen: 0, nextKey: 0 }
const NO_CHUNKS: IStreamChunk[] = []

//* 纯函数推进分片台账: useChatSend 只提供整串 content (SSE token 逐次追加, 无分片数组), 以相邻两次
//* 渲染的长度差反推"新到的一片". 台账走 React 官方 "props 变化时调整 state" 模式 (守卫条件内的
//* 渲染期 setState, 提交前即刻重跑) 而非 ref — 渲染期读写 ref 会命中 react/refs 且令 React Compiler
//* 放弃优化本组件; 纯函数推进 + 长度对齐守卫使 StrictMode 双渲染/并发丢弃重放均幂等 (第二次渲染
//* 长度已对齐, 不再切片). 台账只服务单实例的流式窗口 (每次发送都是新 key 的新气泡实例), 流结束
//* 转 md 渲染后分片序列随分支卸载, 无跨流泄漏.
function advanceLedger(ledger: IStreamLedger, content: string): IStreamLedger
{
    if(content.length < ledger.renderedLen)
    {
        //* 内容回退 (防御: 同实例遭遇换流/重置): 台账整表作废, 现有全文重视为一片.
        return { chunks: [{ key: ledger.nextKey, text: content }], renderedLen: content.length, nextKey: ledger.nextKey + 1 }
    }
    if(content.length > ledger.renderedLen)
    {
        return { chunks: [...ledger.chunks, { key: ledger.nextKey, text: content.slice(ledger.renderedLen) }], renderedLen: content.length, nextKey: ledger.nextKey + 1 }
    }
    return ledger
}

//* 元信息行时间 (HH:mm, 时/分双补零): 项目内无独立时间工具, 本地小函数足够; 缺席/非法时间返回空串,
//* 渲染层以空串整颗跳过 <time> (流式乐观消息 ts 为 null, 不留空位).
function formatMetaTime(iso: string | null): string
{
    if(iso == null)
        return ''
    const d = new Date(iso)
    if(Number.isNaN(d.getTime()))
        return ''
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ChatBubble({ message, streaming = false, thinkingLabel = null }: IChatBubbleProps): ReactElement
{
    const mine = message.role === 'user'
    const bodyRef = useRef<HTMLDivElement | null>(null)
    //* 复制动作 (仅 AI 侧): 写入该条消息全文, 成败都给 toast 反馈 (倾听者角色不静默吞结果).
    //! 剪贴板 API 在非安全上下文 (http 非 localhost) 整体缺席 — 缺席按失败处理, 不让点击悬空无响应.
    const handleCopy = (): void =>
    {
        const writing = navigator.clipboard?.writeText(message.content)
        if(writing == null)
        {
            toast('复制失败', 'error')
            return
        }
        writing.then(
            () => toast('已复制', 'success'),
            () => toast('复制失败', 'error'),
        )
    }

    //* 分片台账 (渲染态, 推进逻辑见 [[advanceLedger]]): 流式窗口内正文长度与台账未对齐即在渲染期
    //* 守卫推进一次 (React 官方 "props 变化时调整 state" 模式), 非流式窗口恒空序列.
    const [ledger, setLedger] = useState<IStreamLedger>(EMPTY_LEDGER)
    let chunks = streaming ? ledger.chunks : NO_CHUNKS
    if(streaming && message.content.length !== ledger.renderedLen)
    {
        const next = advanceLedger(ledger, message.content)
        setLedger(next)
        chunks = next.chunks
    }

    useLayoutEffect(() =>
    {
        if(streaming)
            return  //! 流式期不在此挂 md 容器 (分片通道专属窗口), 文本由 chunk-in span 序列忠实呈现.
        const body = bodyRef.current
        if(body == null)
            return
        body.replaceChildren(renderMdDocument(parseMarkdown(message.content)))
    }, [streaming, message.content])

    if(mine)
    {
        //* 用户形态不变: 右对齐气泡 + 纯文本 (Task 3 只重构 AI 分支).
        return (
            <div className="bubble-row bubble-row-user">
                <div className="bubble bubble-user">
                    <p className="bubble-text">{message.content}</p>
                </div>
            </div>
        )
    }
    const metaTime = formatMetaTime(message.ts)
    return (
        <div className="msg-ai">
            <div className="msg-meta">
                <div className="msg-avatar" aria-hidden="true">灵</div>
                <span className="msg-name">心灵伙伴</span>
                {streaming && chunks.length === 0 && (
                    //* 思考中指示 (用户裁定 2026-10-06): 元信息行 "心灵伙伴" 右侧内嵌 — 三点呼吸 + 微光文本;
                    //* 工具调用时文本切换为扩展自定义 label (工具调用可见性), 事件缺失回落 "思考中";
                    //* 独立等待行与顶栏进度点已移除, 等待视觉即此一处; 首分片到达随条件消失.
                    <span className="msg-thinking" role="status">
                        <svg className="think-dots" viewBox="0 0 40 8" width="36" height="8" aria-hidden="true" focusable="false">
                            <circle className="dotp" cx="4" cy="4" r="3" fill="currentColor" />
                            <circle className="dotp" cx="20" cy="4" r="3" fill="currentColor" />
                            <circle className="dotp" cx="36" cy="4" r="3" fill="currentColor" />
                        </svg>
                        <span className="shimmer-text">{thinkingLabel ?? '思考中'}</span>
                    </span>
                )}
                {metaTime !== '' && (
                    <time className="msg-time" dateTime={message.ts ?? undefined}>{metaTime}</time>
                )}
                {!streaming && (
                    //* 复制钮自旧 .bubble-tools 行迁移至元信息行 (样式沿用 .bubble-copy; 元信息行样式在 base.css .msg-* 段);
                    //* 流式未完不渲染 — 半截文本不值得复制.
                    <button type="button" className="bubble-copy pressable" aria-label="复制回复" onClick={handleCopy}>
                        <Icon name="copy" size={14} />
                    </button>
                )}
            </div>
            {streaming ? (
                //* 流式 (Task 4): 纯文本分片 span 化, 不再走 react-markdown — 分片是流式半截文, 按块级 md
                //* 解析会对跨片语法产生标题/列表误判, 纯文本才是流式期的忠实呈现; React 文本节点天然惰性
                //* (无 innerHTML), 分片化不扩大 XSS 面. 分片为空 (等待窗口) 时不渲染光标条, 等待视觉交给
                //* 思考视觉由本组件 .msg-thinking 指示 (元信息行内嵌, 见元信息行条件渲染); 流结束本分支整体卸载, useLayoutEffect 接管 kv-chat-md.
                <div className="msg-body">
                    <div className="bubble-md">
                        {chunks.map(c => (
                            <span key={c.key} className="chunk-in">{c.text}</span>
                        ))}
                        {chunks.length > 0 && <span className="caret-bar" aria-hidden="true" />}
                    </div>
                </div>
            ) : (
                //* 非流式: 命令式挂 kv-chat-md 容器 (renderMdDocument 返回值自带 MD_SCOPE_CLASS),
                //* replaceChildren 整体替换 — 内容变化 (历史回灌/降级落定) 即重渲染, 无残留节点.
                <div className="msg-body" ref={bodyRef} />
            )}
        </div>
    )
}
