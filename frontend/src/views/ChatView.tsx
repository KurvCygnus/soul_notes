//* 聊天主视图 (homepage-v2 Task 9 重构): hero 空态 (问候 + 居中输入盒) ↔ 消息流双态切换, 由壳经路由挂载 —
//* 会话节即 `/`, 扩展节展开时本组件随路由整体卸载, 回到会话节重挂走既有 openRequest/meta 绑定链.
//* 状态与发送管线全部收敛在 [[useChatSend]] (会话绑定/竞态守卫/降级/中止/登出复位), 本组件只做视图编排;
//* chips 插槽 (D25): 注册表摊平的扩展贡献 + 内置文案经 [[selectVisibleChips]] 收敛后注入 Composer;
//* 访客门全量接线: 文本发送的门在 useChatSend 内 (requireAuth 包 doSend, 登录后补发), chips 走壳式
//* 空动作开门 (上抛不直发), 登录用户无门直发. 壳下发的两条 nonce 请求通道 (sendRequest 唤起发送 /
//* newChatRequest 新建会话复位, 终审整改) 在此消费, 判重防重放.
import { useCallback, useEffect } from 'react'
import type { ReactElement } from 'react'
import { useOutletContext } from 'react-router-dom'
import ChatStream from '../components/chat/ChatStream'
import Composer from '../components/chat/Composer'
import { selectVisibleChips } from '../components/chat/homeChips'
import DailySummaryLine from '../components/summary/DailySummaryLine'
import { homeChips } from '../extensions/registry'
import { useAuth } from '../hooks/useAuth'
import { useChatGate } from '../hooks/useChatGate'
import { useChatSend } from '../hooks/useChatSend'
import type { IChatViewContext } from './chatContext'

//* nonce 消费台账必须是模块级: ChatView 随壳路由挂卸 (扩展节展开即整体卸载, 回会话节重挂),
//* mount-scoped ref 重挂后归零, 会把已消费的 nonce 当新请求重放 — sendRequest 重放 = 重复用户消息 +
//* 未请求的二次 LLM 调用 (登出换号后还会把前账号的提问发出去), newChatRequest 重放 = 重挂后经
//* openRequest 恢复的会话被误清 (评审均定级 Important). 模块级台账跨挂载存活于整个页面会话:
//* 同 nonce 只消费一次 (登出不清理也不会跨账号重放), 新 nonce 照常放行.
let lastConsumedSendNonce = 0
let lastConsumedNewChatNonce = 0

export default function ChatView(): ReactElement
{
    const { sessions, reloadSessions, openRequest, sendRequest, newChatRequest } = useOutletContext<IChatViewContext>()
    const { user } = useAuth()
    const { requireAuth } = useChatGate()
    const { messages, streaming, streamError, startNewChat, handleSend, activeSessionId } = useChatSend({ sessions, openRequest, reloadSessions })

    //* 会话标题 (主区左上) 兜底链: title -> 首条用户消息截断 20 字 -> preview -> 不渲染.
    //* 事实源: sessions 列表按绑定会话 ID 取材 (首轮交换后端经 reloadSessions 刷新后 AI 标题随之到位);
    //* 存量无标题会话以已加载历史的首条用户消息截断兜底 (与后端启动回填同口径: strip 后 20 字封顶),
    //* 历史尚无用户消息时退 preview, 全缺则不渲染 — hero 空态亦无标题.
    const openSession = activeSessionId == null ?
        undefined :
        (sessions ?? []).find(s => s.sessionId === activeSessionId)
    const firstUserContent = messages.find(m => m.role === 'user')?.content.trim() ?? ''
    const openTitle = openSession?.title ||
        (firstUserContent === '' ? null : firstUserContent.slice(0, 20)) ||
        openSession?.preview ||
        null

    //* chips 插槽 (D25): 注册表是静态装配, 摊平 + 上限收敛为纯函数, 每渲染重算成本可忽略 (个位数条目).
    const chips = selectVisibleChips(homeChips)

    //* chips 的访客门: 空动作 pending — 登录成功补发一次 no-op (不替用户直发候选题面), cancel 丢弃.
    const requireLogin = useCallback(() => { requireAuth(() => {}) }, [requireAuth])

    //* 壳下发发送请求通道: nonce 判重 (台账见模块顶注; handleSend 身份因上游重建而变化导致 effect 重跑,
    //* 也不会重放同一请求), 经聊天发送管线走与 Composer 完全相同的门 + 流式路径.
    //* 生产者现状: 情境卡已随 homepage-v2 退场, 通道恒 null 无害, 留作未来唤起类入口原地复用.
    useEffect(() =>
    {
        if(sendRequest == null || sendRequest.nonce === lastConsumedSendNonce)
            return
        lastConsumedSendNonce = sendRequest.nonce
        handleSend(sendRequest.content)
    }, [sendRequest, handleSend])

    //* 壳下发新建会话通道 (终审整改): nonce 判重, 消费即 startNewChat 复位 — 与会话内工具条 "新对话"
    //* 同一终点, 侧栏钮对登录用户由此获得与工具条等价的能力.
    useEffect(() =>
    {
        if(newChatRequest == null || newChatRequest.nonce === lastConsumedNewChatNonce)
            return
        lastConsumedNewChatNonce = newChatRequest.nonce
        startNewChat()
    }, [newChatRequest, startNewChat])

    const showHero = messages.length === 0
    //* 流式期间禁并发 (Composer 侧停用, doSend 的 abort 仅兜底); 两态共用同一实例, 同屏只渲染一处.
    const composer = (
        <Composer
            onSend={handleSend}
            disabled={streaming}
            chips={chips}
            onRequireLogin={user == null ? requireLogin : undefined}
        />
    )
    //* 每日总结「」行 (Task 10) 随 composer 迁入本组件 (Task 9): 输入区正下方, 登录态限定
    //* (访客请求必 401, 无谓打点); 无总结/失败整件隐身, 组件自包含三态降级.
    const summaryLine = user != null ? <DailySummaryLine /> : null

    return (
        <div className="chat-view">
            {streamError != null && <div className="chat-error" role="alert">{streamError}</div>}
            {showHero ? (
                <div className="chat-placeholder">
                    <div className="hero-box">
                        <h1>你好, 今天想聊点什么?</h1>
                        <p>我是你的倾听伙伴, 任何想法都可以在这里慢慢说.</p>
                        {composer}
                        {summaryLine}
                    </div>
                </div>
            ) : (
                <>
                    <div className="chat-toolbar">
                        {openTitle != null && <div className="chat-title" title={openTitle}>{openTitle}</div>}
                        <button type="button" className="btn btn-sm" onClick={startNewChat}>新对话</button>
                    </div>
                    <ChatStream messages={messages} streaming={streaming} />
                    {composer}
                    {summaryLine}
                </>
            )}
        </div>
    )
}
