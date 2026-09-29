//* 单条消息气泡: 用户/AI 双态配色走设计令牌 (--user-bubble/--ai-bubble).
//* 用户侧保持纯文本 (用户输入不应被 Markdown 语法意外改写), AI 侧走 Markdown 渲染 (react-markdown + remark-gfm).
//* 链接安全策略 (AI 输出不可信): http(s) → 新窗口 + noreferrer noopener; '/' 开头 → SPA 内部路由 (如 /crisis);
//! 其余协议 (javascript:/data: 等) 一律降级为纯文本, 不渲染可点锚点 — 杜绝注入型跳转.
import { Link } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { IDisplayMessage } from '../../utils/group'

export interface IChatBubbleProps
{
    message: IDisplayMessage
    streaming?: boolean
}

//* Markdown 链接白名单替换 (react-markdown components.a): 只放行安全形态, 其余降级.
function SafeLink({ href, children }: { href?: string; children?: ReactNode }): ReactElement
{
    if(href == null)
        return <span>{children}</span>  //* 无 href 锚点本就不可点, 降级纯文本保持语义.
    if(/^https?:\/\//i.test(href))
        return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
    if(href.startsWith('/'))
        return <Link to={href}>{children}</Link>  //* 站内路径 (如危机支持): 走 SPA 路由, 不整页刷新丢状态.
    return <span>{children}</span>  //! javascript:/data: 等危险协议一律降级纯文本, AI 输出不可作为导航信任源.
}

export default function ChatBubble({ message, streaming = false }: IChatBubbleProps): ReactElement
{
    const mine = message.role === 'user'
    return (
        <div className={mine ? 'bubble-row bubble-row-user' : 'bubble-row'}>
            <div className={mine ? 'bubble bubble-user' : 'bubble bubble-ai'}>
                {mine ? (
                    <p className="bubble-text">{message.content}</p>
                ) : (
                    <div className="bubble-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: SafeLink }}>
                            {message.content}
                        </ReactMarkdown>
                        {streaming && <span className="chat-cursor" aria-hidden="true">▍</span>}
                    </div>
                )}
            </div>
        </div>
    )
}
