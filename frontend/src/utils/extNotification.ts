//* 扩展通知投递路由 (P3, spec §2): WS ext-notification 事件的终端分流, 唯一裁决依据是 document.visibilityState —
//* 前台 (WebView 可见): 应用内横幅 (复用 ToastHost 体系, 时长加长), 不调壳桥 — 防系统通知与横幅双响;
//* 后台 (WebView 不可见): 调壳桥 window.AndroidShellNotify.notify(tag,title,body) 发系统通知;
//* 壳桥缺席 (纯浏览器/旧壳) 静默 — 可选链零影响. 通知链路任何异常不得波及聊天主链路 (spec §2 静默降级红线).
import { toast } from './toast'

//* 前台横幅驻留时长: 高于普通 toast 的 3.2s 默认档 — 提醒类信息 (如上课前 15 分钟) 给足阅读时间, 不可一闪而过.
export const EXT_NOTIFICATION_BANNER_MS = 8000

//* 与 WS 帧解耦的投递负载: 路由层只关心展示三要素, type 判别已由 ws.ts 结构化判定完成.
export interface IExtNotificationPayload
{
    title: string
    body: string
    tag: string
}

//* 壳桥形态 (Task 2 并行提供, 前端只按契约调全局钩子): notify(tag, title, body) 发系统通知 (通道 "ext").
export interface IAndroidShellNotifyBridge
{
    notify(tag: string, title: string, body: string): void
}

declare global
{
    interface Window
    {
        AndroidShellNotify?: IAndroidShellNotifyBridge
    }
}

export function deliverExtNotification(msg: IExtNotificationPayload): void
{
    if(document.visibilityState === 'visible')
    {
        toast(`${msg.title} · ${msg.body}`, 'info', EXT_NOTIFICATION_BANNER_MS)  //* 分隔符沿用扩展行 " · " 惯例.
        return
    }
    //* 钩子缺席即静默: 纯浏览器形态无壳可调, 可选链零影响, 绝不让通知链路抛错冒泡.
    window.AndroidShellNotify?.notify(msg.tag, msg.title, msg.body)
}
