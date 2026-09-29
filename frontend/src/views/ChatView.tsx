//* 聊天主视图: hero 空态 (问候 + 居中输入盒) ↔ 消息流双态切换.
//* 状态与发送管线全部收敛在 [[useChatSend]] (会话绑定/竞态守卫/降级/中止/记一笔), 本组件只做视图编排;
//* Task 11: 双态输入区 <Composer/> 就位, 聊天与日记两条发送路径的访客门拦截语义都在 useChatSend 内统一收口.
import type { ReactElement } from 'react'
import { useOutletContext } from 'react-router-dom'
import ChatStream from '../components/chat/ChatStream'
import Composer from '../components/chat/Composer'
import { useChatSend } from '../hooks/useChatSend'
import type { IChatViewContext } from './chatContext'

export default function ChatView(): ReactElement
{
    const { sessions, reloadSessions, openRequest } = useOutletContext<IChatViewContext>()
    const { messages, streaming, streamError, startNewChat, handleSend } = useChatSend({ sessions, openRequest, reloadSessions })

    const showHero = messages.length === 0
    //* 流式期间禁并发 (Composer 侧停用, doSend 的 abort 仅兜底); 两态共用同一实例, 同屏只渲染一处.
    const composer = <Composer onSend={handleSend} disabled={streaming} />

    return (
        <div className="chat-view">
            {streamError != null && <div className="chat-error" role="alert">{streamError}</div>}
            {showHero ? (
                <div className="chat-placeholder">
                    <div className="hero-box">
                        <h1>你好, 今天想聊点什么?</h1>
                        <p>我是你的倾听伙伴, 任何想法都可以在这里慢慢说.</p>
                        {composer}
                    </div>
                </div>
            ) : (
                <>
                    <div className="chat-toolbar">
                        <button type="button" className="btn btn-sm" onClick={startNewChat}>新对话</button>
                    </div>
                    <ChatStream messages={messages} streaming={streaming} />
                    {composer}
                </>
            )}
        </div>
    )
}
