//* 聊天主视图: hero 空态 (问候 + 居中输入盒) ↔ 消息流双态切换.
//* 状态与发送管线全部收敛在 [[useChatSend]] (会话绑定/竞态守卫/降级/中止/记一笔), 本组件只做视图编排;
//* Task 11: 双态输入区 <Composer/> 就位, 聊天与日记两条发送路径的访客门拦截语义都在 useChatSend 内统一收口.
//* Task 12: 消费壳下发的 sendRequest (情境卡唤起), 以聊天模式路由进 handleSend — nonce 判重防重放.
import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useOutletContext } from 'react-router-dom'
import ChatStream from '../components/chat/ChatStream'
import Composer from '../components/chat/Composer'
import { useChatSend } from '../hooks/useChatSend'
import type { IChatViewContext } from './chatContext'

//* 情境唤起通道的消费台账必须是模块级: ChatView 与危机页是同壳兄弟路由, `/` ↔ `/crisis` 来回切换会整体卸载重挂,
//* mount-scoped ref 重挂后归零, 会把已消费的 nonce 当新请求重放 (重复用户消息 + 未请求的二次 LLM 调用,
//* 且登出换号后新用户的首聊会重放前账号的提问 — 评审定级 Important). 模块级台账跨挂载存活于整个页面会话:
//* 同 nonce 只消费一次 (登出不清理也不会跨账号重放), 新 nonce 照常放行, "卡片在 /crisis 点击 → 回聊天即发送"的预期不受影响.
let lastConsumedSendNonce = 0

export default function ChatView(): ReactElement
{
    const { sessions, reloadSessions, openRequest, sendRequest } = useOutletContext<IChatViewContext>()
    const { messages, streaming, streamError, startNewChat, handleSend } = useChatSend({ sessions, openRequest, reloadSessions })

    //* 情境卡唤起通道: nonce 判重 (台账见模块顶注; handleSend 身份因上游重建而变化导致 effect 重跑, 也不会重放同一请求),
    //* 经 handleSend('chat') 走与 Composer 完全相同的门 + 流式管线.
    useEffect(() =>
    {
        if(sendRequest == null || sendRequest.nonce === lastConsumedSendNonce)
            return
        lastConsumedSendNonce = sendRequest.nonce
        handleSend(sendRequest.content, 'chat')
    }, [sendRequest, handleSend])

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
