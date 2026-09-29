//* 聊天主视图: hero 空态 (问候 + 居中输入盒占位) ↔ 消息流双态切换.
//* 状态与发送管线全部收敛在 [[useChatSend]] (会话绑定/竞态守卫/降级/中止), 本组件只做视图编排;
//* Composer 为 Task 11 交付, 输入区以 data-testid="composer-slot" 占位作为替换锚点.
import type { ReactElement } from 'react'
import { useOutletContext } from 'react-router-dom'
import ChatStream from '../components/chat/ChatStream'
import { useChatSend } from '../hooks/useChatSend'
import type { IChatViewContext } from './chatContext'

export default function ChatView(): ReactElement
{
    const { sessions, reloadSessions, openRequest } = useOutletContext<IChatViewContext>()
    //* handleSend 暂不消费: Task 11 的 <Composer onSend={handleSend}/> 替换 composer-slot 后接线.
    const { messages, streaming, streamError, startNewChat } = useChatSend({ sessions, openRequest, reloadSessions })

    const showHero = messages.length === 0

    return (
        <div className="chat-view">
            {streamError != null && <div className="chat-error" role="alert">{streamError}</div>}
            {showHero ? (
                <div className="chat-placeholder">
                    <div className="hero-box">
                        <h1>你好, 今天想聊点什么?</h1>
                        <p>我是你的倾听伙伴, 任何想法都可以在这里慢慢说.</p>
                        <div className="composer-slot card" data-testid="composer-slot">输入区即将上线</div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="chat-toolbar">
                        <button type="button" className="btn btn-sm" onClick={startNewChat}>新对话</button>
                    </div>
                    <ChatStream messages={messages} streaming={streaming} />
                    <div className="composer-slot card" data-testid="composer-slot">输入区即将上线</div>
                </>
            )}
        </div>
    )
}
