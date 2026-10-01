//* 聊天发送管线 (ChatView 的状态收敛点): SSE 流式主路径 + 非流式降级 + 会话绑定 + 竞态守卫 (Task 11).
//* homepage-v2 Task 9 (D16 记一笔移除): 日记域入口退场, handleSend 收敛为单一聊天模式 —
//* RED 预警不再有日记兜底出口, 在线链走 WS 通道, 离线安全网由后端热线/危机域承接 (前端不触碰红线链).
//* 核心机制 (收敛在 genRef 单一单调通道上):
//*   1. 会话绑定: sessionIdRef 是唯一事实, meta 事件与历史打开都写它; 渲染不读 ref (React 契约).
//*   2. 竞态守卫: openSession/startNewChat/doSend 各自 ++genRef 并捕获快照, 一切异步回调 (onChunk/
//*      历史应用/降级/错误提示) 应用前先比对 gen — 快速连点只认最后一次, 流中切换使旧流全部失效.
//*   3. 会话切换策略 = 切换即中止 (abort-on-switch): 打开会话/新对话先 abort 在途流, 部分内容随旧会话
//*      一起丢弃; 不锁侧栏 (锁定策略需把流式状态提升进壳层, 代价大于收益), 取舍记录于 task-10 报告.
//*   4. 卸载中止: cleanup abort 在途 fetch 释放连接, aliveRef 拦截迟到回调 (StrictMode 重挂安全).
import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages, sendMessage, streamMessage } from '../api/chat'
import { ApiError } from '../api/http'
import { useAuth } from './useAuth'
import { useChatGate } from './useChatGate'
import type { ISessionOpenRequest } from '../views/chatContext'
import type { IDisplayMessage } from '../utils/group'
import type { ChatMessage, ChatSessionVo } from '../types'

export interface IUseChatSendParams
{
    sessions: ChatSessionVo[] | null
    openRequest: ISessionOpenRequest | null
    reloadSessions(): void
}

export interface IChatSendState
{
    messages: IDisplayMessage[]
    streaming: boolean
    streamError: string | null
    startNewChat(): void
    //* Task 11 Composer 的接线点: 访客经门拦截 (requireAuth 已登录时同步放行), 登录后补发.
    handleSend(content: string): void
    //* 当前打开 (绑定) 的会话 ID; null = 无 (hero/新对话). 渲染态: 视图层据此从 sessions 列表取材
    //* (会话标题主区左上展示), 事实源仍是 sessions 列表 (reload 后标题随之刷新).
    activeSessionId: string | null
}

//* 流式增量: 追加到末尾消息. 单发送不变量: 流式期间末尾必为本条的 assistant 气泡 (历史加载由 gen 守卫互斥).
function appendToken(prev: IDisplayMessage[], token: string): IDisplayMessage[]
{
    const last = prev[prev.length - 1]
    if(last == null)
        return prev
    return [...prev.slice(0, -1), { ...last, content: last.content + token }]
}

//* 降级回复: 以服务端 ts 戳版本替换末尾空 assistant 气泡; 末尾形态不符即不动 (防御式, 不误伤).
function applyReply(prev: IDisplayMessage[], reply: ChatMessage): IDisplayMessage[]
{
    const last = prev[prev.length - 1]
    if(last == null || last.role !== 'assistant' || last.content !== '')
        return prev
    return [...prev.slice(0, -1), { role: 'assistant', content: reply.content, ts: reply.timestamp ?? null }]
}

//* 彻底失败: 移除末尾空 assistant 气泡 (保留用户消息与错误提示), 不留空泡.
function dropTrailingEmpty(prev: IDisplayMessage[]): IDisplayMessage[]
{
    const last = prev[prev.length - 1]
    if(last == null || last.role !== 'assistant' || last.content !== '')
        return prev
    return prev.slice(0, -1)
}

//* 与 [[api]]/[[streamMessage]] 的取消约定逐字对齐: 按 name 判定而非 instanceof DOMException (跨 realm 不可靠).
function isAbort(e: unknown): boolean
{
    return e instanceof Error && e.name === 'AbortError'
}

export function useChatSend({ sessions, openRequest, reloadSessions }: IUseChatSendParams): IChatSendState
{
    //* 登录态判定收在门内 ([[IChatGate.requireAuth]] 读 userRef); 这里直读 user 仅为登出复位 (隐私红线):
    //* 登出瞬间未读会话内容必须立即离开屏幕, 不能等下一次交互.
    const { user } = useAuth()
    const gate = useChatGate()

    const [messages, setMessages] = useState<IDisplayMessage[]>([])
    const [streaming, setStreaming] = useState(false)
    const [streamError, setStreamError] = useState<string | null>(null)
    //* 绑定会话的渲染态镜像: sessionIdRef 仍是唯一事实 (竞态守卫读 ref), 本 state 只供视图取材.
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

    const sessionIdRef = useRef<string | null>(null)
    const genRef = useRef(0)
    const abortRef = useRef<AbortController | null>(null)
    const aliveRef = useRef(true)

    useEffect(() =>
    {
        aliveRef.current = true  //* StrictMode 双调用 setup: 重挂前复位, 守卫不能被上一次 cleanup 污染.
        return () =>
        {
            aliveRef.current = false
            abortRef.current?.abort()  //* 卸载中止在途流: 释放连接, 迟到回调被 aliveRef 拦截.
        }
    }, [])

    const loadMessages = useCallback((id: string, gen: number): void =>
    {
        listMessages(id).
            then(list =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return
                setMessages(list.map(m => ({ role: m.role, content: m.content, ts: m.ts ?? null })))
            }).
            catch((e: unknown) =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return
                setStreamError(e instanceof ApiError ? e.message : '会话加载失败, 请稍后再试.')
            })
    }, [])

    const openSession = useCallback((id: string) =>
    {
        if(sessionIdRef.current === id)
            return  //* 已在该会话: 幂等短路 (重复点击不重复拉取, 也避免流中自中止).
        abortRef.current?.abort()  //* 切换即中止 (机制 3): 在途流随旧会话一起丢弃.
        const gen = ++genRef.current
        sessionIdRef.current = id
        setActiveSessionId(id)
        setStreaming(false)
        setStreamError(null)
        loadMessages(id, gen)
    }, [loadMessages])

    const startNewChat = useCallback(() =>
    {
        abortRef.current?.abort()
        ++genRef.current
        sessionIdRef.current = null
        setActiveSessionId(null)
        setStreaming(false)
        setStreamError(null)
        setMessages([])
    }, [])

    //* 侧栏打开请求通道: nonce 变化即尝试打开, openSession 内部幂等.
    useEffect(() =>
    {
        if(openRequest != null)
            openSession(openRequest.sessionId)
    }, [openRequest, openSession])

    //* 打开中的会话被删除 (壳层 sessions 列表比对): 自动复位 hero. 失败重拉保留旧列表, 不会误清.
    useEffect(() =>
    {
        const openId = sessionIdRef.current
        if(openId == null || sessions == null)
            return
        if(!sessions.some(s => s.sessionId === openId))
            startNewChat()
    }, [sessions, startNewChat])

    //* 登出复位 (隐私): user -> null 即无条件清屏 ([[startNewChat]] = abort 在途流 + ++gen 使一切迟到回调
    //* 失效 + 清 messages/streaming/streamError/sessionIdRef). 不能以 sessionIdRef 是否已绑定作前置:
    //* meta 未达 (未绑定窗口) 与新会话降级全程 sessionIdRef 均为 null, 条件化会让乐观气泡与迟到的
    //* 降级回复留在已登出的屏幕上. 幂等: 空屏重复执行无副作用; 再登录分支不在此处理.
    useEffect(() =>
    {
        if(user == null)
            // oxlint-disable-next-line react/set-state-in-effect //! 登出清屏是对认证状态迁移的响应式复位, 属 effect 的合法外部系统同步; 渲染期调整或 key 重挂会扩大改动面, 规则的级联担忧在此不成立 (登出是低频单次迁移).
            startNewChat()
    }, [user, startNewChat])

    //* 发送成功收尾: 补拉历史换 ts 戳版本 (乐观消息无 ts), 并刷新侧栏会话列表.
    const finalizeSend = useCallback((gen: number): void =>
    {
        const bound = sessionIdRef.current
        if(bound != null)
            loadMessages(bound, gen)
        reloadSessions()
    }, [loadMessages, reloadSessions])

    const doSend = useCallback((content: string) =>
    {
        abortRef.current?.abort()  //* 上一条流若仍在途: 先中止 (Composer Task 11 将禁并发, 这里兜底).
        const gen = ++genRef.current
        const controller = new AbortController()
        abortRef.current = controller

        setMessages(prev => [...prev, { role: 'user', content, ts: null }, { role: 'assistant', content: '', ts: null }])
        setStreamError(null)
        setStreaming(true)

        let received = false  //* 同步闩锁: 流式是否已到过内容, 决定失败走降级还是保留部分.
        streamMessage({
            sessionId: sessionIdRef.current,
            content,
            signal: controller.signal,
            onMeta: id =>
            {
                sessionIdRef.current = id  //* meta 绑定: 后端实际使用的会话 ID, 后续发送续接.
                setActiveSessionId(id)
            },
            onChunk: token =>
            {
                received = true
                if(!aliveRef.current || genRef.current !== gen)
                    return  //* 切换/卸载后的迟到 token: 丢弃, 不污染新视图.
                setMessages(prev => appendToken(prev, token))
            },
        }).
            then(() =>
            {
                if(!aliveRef.current || genRef.current !== gen)
                    return
                setStreaming(false)
                finalizeSend(gen)
            }).
            catch((e: unknown) =>
            {
                if(!aliveRef.current || genRef.current !== gen || isAbort(e))
                    return  //* 切换/卸载/主动中止: 新视图已接管, 一切静默.
                if(received)
                {
                    setStreaming(false)
                    setStreamError('回复中断了, 已保留部分内容, 你可以稍后再试.')
                    return
                }
                //* 降级: 流式零内容失败 → 非流式同会话重试一次 (离线安全网语义: 网络不可达时两个路径同失败).
                sendMessage(sessionIdRef.current, content).
                    then(reply =>
                    {
                        if(!aliveRef.current || genRef.current !== gen)
                            return
                        setStreaming(false)
                        setMessages(prev => applyReply(prev, reply))
                        finalizeSend(gen)
                    }).
                    catch(() =>
                    {
                        if(!aliveRef.current || genRef.current !== gen)
                            return
                        setStreaming(false)
                        setMessages(prev => dropTrailingEmpty(prev))
                        setStreamError('消息暂时没有送达, 请稍后再试.')
                    })
            }).
            finally(() =>
            {
                if(abortRef.current === controller)
                    abortRef.current = null  //* 身份比对: 防止误清后继发送的 controller.
            })
    }, [finalizeSend])

    //* 发送入口 (Task 11 Composer 接线): 访客点发送 → 门拦截开浮层, confirm 落登录态后补发; 已登录直接放行.
    const handleSend = useCallback((content: string) =>
    {
        gate.requireAuth(() => doSend(content))
    }, [doSend, gate])

    return { messages, streaming, streamError, startNewChat, handleSend, activeSessionId }
}
