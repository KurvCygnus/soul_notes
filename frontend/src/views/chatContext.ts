//* 壳 ↔ 聊天视图的通道契约: 会话列表状态提升在 AppShell (Task 10 裁决), 经 <Outlet context> 下发
//* (route element composition); 历史加载与流式发送归 ChatView. 两侧共同 import 本文件, 无循环依赖.
import type { ChatSessionVo } from '../types'

//* 会话打开请求: Sidebar 点击 (壳持有) → ChatView 消费. nonce 单调递增, 同一会话重复点击也重新触发.
export interface ISessionOpenRequest
{
    sessionId: string
    nonce: number
}

//* 情境唤起发送请求: 壳持有 → ChatView 单参 handleSend(content) 消费 (聊天单模式, 无第二形态参数).
//* 与 ISessionOpenRequest 同一通道机制 (nonce 单调递增, 壳经 <Outlet context> 下发), ChatView 以 ref 记账防重放.
//* 生产者现状: 情境卡已随 homepage-v2 退场, 通道恒 null 无害, 留作未来唤起类入口原地复用 (壳侧契约钉住).
export interface ISendRequest
{
    content: string
    nonce: number
}

export interface IChatViewContext
{
    //* null = 访客/加载中; 空数组 = 已加载但无会话.
    sessions: ChatSessionVo[] | null
    //* 发送完成后由 ChatView 回调, 刷新侧栏会话列表 (新会话/预览变化).
    reloadSessions(): void
    openRequest: ISessionOpenRequest | null
    //* Task 12: 情境卡唤起请求 (null = 无); nonce 判重, 同一请求只发送一次.
    sendRequest: ISendRequest | null
}
