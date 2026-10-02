//* RED 预警弹窗 (产品红线): 全屏置顶安全模态, 暖文案非医疗化, 首屏不等网络 —
//* 状态初值直接取内置默认热线 (同步常量), getCachedHotline 仅在挂载后异步刷新 — 零网络下弹窗照样完整可用.
//* 语义裁决: role=alertdialog + aria-modal; Escape 不挂监听 (安全模态必须显式"我知道了", 防误触跳过求助信息);
//* 服务端随帧下发的 alert.hotline 是本次预警的最新号码, 优先于三级缓存结果.
//* Task 8: /crisis 路由已撤, "查看全部求助资源" 改为上抛 onOpenResources (壳负责关 RED 并开危机 Flyout);
//! 未接线时兜底走 onClose — 安全出口绝不悬空, 弹层自身不再触碰路由.
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { getCachedHotline, DEFAULT_HOTLINE } from '../../api/hotline'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { IRedAlertMessage } from '../../api/ws'
import type { HotlineInfo } from '../../types'

export interface IRedAlertModalProps
{
    alert: IRedAlertMessage
    onClose(): void
    onOpenResources?: () => void
}

export default function RedAlertModal({ alert, onClose, onOpenResources }: IRedAlertModalProps): ReactElement
{
    //* 首屏即默认兜底: useState 初值为同步常量, 首绘绝不等待网络; 缓存/API 到达后原位刷新.
    const [hotline, setHotline] = useState<HotlineInfo>(DEFAULT_HOTLINE)
    const rootRef = useRef<HTMLDivElement>(null)
    const primaryRef = useRef<HTMLAnchorElement>(null)
    //* 焦点陷阱 (走查裁决 2026-10-03): 安全模态的 Tab 循环更不允许逸出 — 背景内容被预警遮罩覆盖, 逸出即不可见交互.
    useFocusTrap(rootRef, true)

    useEffect(() =>
    {
        let alive = true
        getCachedHotline().then(info =>
        {
            if(alive)
                setHotline(info)
        }).
            catch(() =>
            {
                //! getCachedHotline 契约上不 reject, 此处纯防御: 缓存链异常时保持默认号码, 弹窗永不空号码.
            })
        return () => { alive = false }
    }, [])

    //* 焦点管理: 打开即聚焦主热线按钮 (键盘/读屏用户第一落点); 退场即时卸载 (安全模态离场零延迟, 不参与浮层退场动画).
    useEffect(() =>
    {
        primaryRef.current?.focus()
    }, [])

    const primary = alert.hotline != null && alert.hotline !== '' ? alert.hotline : hotline.primary

    return (
        <div
            ref={rootRef}
            className="red-alert-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="red-alert-title"
            aria-describedby="red-alert-reason"
        >
            {/* anim-pop (Task 13): 浮层家族同款入场淡入, 纯视觉不延迟可读性 (内容已在 DOM). */}
            <div className="red-alert-panel anim-pop">
                <h2 id="red-alert-title">我们很关心你现在的安全</h2>
                <p id="red-alert-reason" className="red-alert-reason">
                    {alert.reason ?? '你此刻的感受很重要, 请让自己身边有人陪伴.'}
                </p>
                <p className="red-alert-warm">这不是你的错, 也不必一个人扛. 现在就拨打下面的电话, 那头有人愿意听你慢慢说.</p>
                <a ref={primaryRef} className="red-alert-call" href={`tel:${primary}`}>
                    立即拨打 {primary}
                </a>
                <p className="red-alert-backup">
                    备用热线: <a href={`tel:${hotline.backup}`}>{hotline.backup}</a>
                    {hotline.name !== '' ? ` (${hotline.name})` : ''}
                </p>
                {hotline.appointmentUrl !== '' && (
                    <a
                        className="btn red-alert-book"
                        href={hotline.appointmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        预约学校心理咨询
                    </a>
                )}
                <div className="red-alert-foot">
                    <button type="button" className="red-alert-more" onClick={onOpenResources ?? onClose}>查看全部求助资源</button>
                    <button type="button" className="btn" onClick={onClose}>我知道了</button>
                </div>
            </div>
        </div>
    )
}
