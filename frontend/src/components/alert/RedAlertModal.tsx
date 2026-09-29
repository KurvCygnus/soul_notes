//* RED 预警弹窗 (产品红线): 全屏置顶安全模态, 暖文案非医疗化, 首屏不等网络 —
//* 状态初值直接取内置默认热线 (同步常量), getCachedHotline 仅在挂载后异步刷新 — 零网络下弹窗照样完整可用.
//* 语义裁决: role=alertdialog + aria-modal; Escape 不挂监听 (安全模态必须显式"我知道了", 防误触跳过求助信息);
//* 服务端随帧下发的 alert.hotline 是本次预警的最新号码, 优先于三级缓存结果.
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { getCachedHotline, DEFAULT_HOTLINE } from '../../api/hotline'
import type { IRedAlertMessage } from '../../api/ws'
import type { HotlineInfo } from '../../types'

export interface IRedAlertModalProps
{
    alert: IRedAlertMessage
    onClose(): void
}

export default function RedAlertModal({ alert, onClose }: IRedAlertModalProps): ReactElement
{
    //* 首屏即默认兜底: useState 初值为同步常量, 首绘绝不等待网络; 缓存/API 到达后原位刷新.
    const [hotline, setHotline] = useState<HotlineInfo>(DEFAULT_HOTLINE)
    const primaryRef = useRef<HTMLAnchorElement>(null)

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

    //* 焦点管理: 打开即聚焦主热线按钮 (键盘/读屏用户第一落点); 不做焦点圈禁 — 安全模态以显式确认为界.
    useEffect(() =>
    {
        primaryRef.current?.focus()
    }, [])

    const primary = alert.hotline != null && alert.hotline !== '' ? alert.hotline : hotline.primary

    return (
        <div
            className="red-alert-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="red-alert-title"
            aria-describedby="red-alert-reason"
        >
            <div className="red-alert-panel">
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
                    <Link to="/crisis" className="red-alert-more" onClick={onClose}>查看全部求助资源</Link>
                    <button type="button" className="btn" onClick={onClose}>我知道了</button>
                </div>
            </div>
        </div>
    )
}
