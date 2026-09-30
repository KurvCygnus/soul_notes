//* RED 预警上下文: 弹窗唯一入口 showRed + 登录态驱动的 WS 预警通道生命周期 (在线推送路径).
//* 生命周期: user 非 null 即建连, 归 null 即断开; 令牌变更 (登出→换号登录/直接换登) 因 user 引用变化
//* 触发 effect cleanup 断旧连 + 重建新连. 断线重连与指数退避归 ws.ts 所有, 本层只管建立与撤销.
//* showRed 单一来源: WS 在线推送 (onRed 直通) — 日记域 RED 兜底已随记一笔移除退场 (homepage-v2 D16),
//* 离线安全网归热线三级缓存与危机域承接, 前端不再有第二条开弹窗路径.
import { createContext, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { connectAlertSocket } from '../api/ws'
import { useAuth } from '../hooks/useAuth'
import type { IRedAlertMessage } from '../api/ws'

//* 弹窗状态切片: [[useAlert]] 的返回契约 (AppShell 渲染浮层 / useChatSend 日记兜底消费).
export interface IAlertState
{
    red: IRedAlertMessage | null
    showRed(msg: IRedAlertMessage): void
    dismissRed(): void
}

//* 单例上下文: null 表示未挂 <AlertProvider>, 读取器据此硬报错.
const AlertContext = createContext<IAlertState | null>(null)

export function AlertProvider({ children }: { children: ReactNode })
{
    const { user } = useAuth()
    const [red, setRed] = useState<IRedAlertMessage | null>(null)

    //* WS 通道随登录态: 访客 (user == null) 不建连 — 零 WS 连接, 并清空残留 red (red.reason 可能携带上一账号日记摘要,
    //* 登出/换号瞬间若不归零, 弹窗会把前一账号的预警内容泄露给当前使用者 — 跨账号隐私红线); setRed 直接作 onRed, WS 帧即开弹窗.
    useEffect(() =>
    {
        if(user == null)
        {
            // oxlint-disable-next-line react/set-state-in-effect //! 登出清空 RED 态是对认证状态迁移的响应式复位, 与同文件 WS 断开同源同刻; 渲染期复位或 key 重挂会扩大改动面, 登出是低频单次迁移, 规则的级联担忧在此不成立.
            setRed(null)//* 登出即清空 RED 弹窗态: 与 WS 断开同源同刻, 访客态下不允许任何账号的预警残留.
            return
        }
        const close = connectAlertSocket(user.token, setRed)
        return () => { close() }
    }, [user])

    const showRed = useCallback((msg: IRedAlertMessage) => { setRed(msg) }, [])
    const dismissRed = useCallback(() => { setRed(null) }, [])

    const value: IAlertState = { red, showRed, dismissRed }

    return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
}

export { AlertContext }
