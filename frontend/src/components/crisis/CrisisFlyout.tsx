//* 危机支持居中 Flyout (Task 8, spec §4.2/D22): 内容自 CrisisView 迁入的居中浮层 — 汉堡菜单与 RED 弹窗双入口,
//* 壳不设 auth 条件 (产品红线: 危机入口对访客无门). 数据 = getCachedHotline 三级缓存 (api/hotline 原样不动):
//* 状态初值取内置默认 (同步常量, 零网络首绘完整可读), open 期间异步刷新 — 挂起态也绝不空号码.
//* 退场动画 (走查裁决 2026-10-03, 取代 "出场即时卸载"): useExitAnimation 续挂一轮淡出, 焦点陷阱罩住 Tab 循环.
import { useEffect, useRef, useState } from 'react'
import type { AnimationEvent, ReactElement } from 'react'
import { getCachedHotline, DEFAULT_HOTLINE } from '../../api/hotline'
import { useExitAnimation } from '../../hooks/useExitAnimation'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { HotlineInfo } from '../../types'

export interface ICrisisFlyoutProps
{
    open: boolean
    onClose(): void
}

export default function CrisisFlyout({ open, onClose }: ICrisisFlyoutProps): ReactElement | null
{
    const { mounted, closing, markExited } = useExitAnimation(open)
    const rootRef = useRef<HTMLDivElement>(null)
    useFocusTrap(rootRef, open && !closing)
    //* 首屏即默认兜底 (沿用 RedAlertModal 的同步初值模式): useState 初值为常量, 首绘绝不等待网络.
    const [hotline, setHotline] = useState<HotlineInfo>(DEFAULT_HOTLINE)
    const primaryRef = useRef<HTMLAnchorElement>(null)

    const onExitAnimationEnd = (e: AnimationEvent<HTMLDivElement>): void =>
    {
        //* 只认根节点自己的退场动画 (面板 anim-pop 入场会冒泡上来), 名字过滤防入场动画误触发卸载.
        if(closing && e.target === e.currentTarget && e.animationName === 'overlay-exit')
            markExited()
    }

    //* 缓存刷新仅在 open 期间进行: 关闭态不发起任何取数 (挂载常驻于壳, 靠 open 短路).
    useEffect(() =>
    {
        if(!open)
            return
        let alive = true
        getCachedHotline().then(info =>
        {
            if(alive)
                setHotline(info)
        }).
            catch(() =>
            {
                //! getCachedHotline 契约上不 reject, 此处纯防御: 缓存链异常时保持默认号码, 浮层永不空号码.
            })
        return () => { alive = false }
    }, [open])

    //* 焦点管理: open 翻真时先存触发元素再聚焦主号码 (键盘/读屏用户第一落点); 关闭时还原焦点.
    //! 触发元若已随上游卸载 (壳内真实触发是菜单项, 开 Flyout 前菜单先收起) 则跳过还原, 不强塞焦点给已离场节点.
    useEffect(() =>
    {
        if(!open)
            return
        const previous = document.activeElement
        primaryRef.current?.focus()
        return () =>
        {
            if(previous instanceof HTMLElement && previous.isConnected)
                previous.focus()
        }
    }, [open])

    //* Escape 关闭: 仅在场期间挂 document 级监听, 关闭/卸载即注销 (与菜单/抽屉同形).
    //! 非 RED 场景允许 Escape (RED 弹窗是独立安全模态, 自身不响应 Escape, 不受此辖).
    useEffect(() =>
    {
        if(!open)
            return
        const onKey = (e: KeyboardEvent): void =>
        {
            if(e.key === 'Escape')
                onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if(!mounted)
        return null

    return (
        //* 遮罩即 dialog 实体: 点遮罩任意非面板处关闭, 面板内 stopPropagation 截停冒泡.
        <div
            ref={rootRef}
            className={`crisis-flyout${closing ? ' closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="crisis-flyout-title"
            onClick={open ? onClose : undefined}  //* 退场期掐交互: onClose 只在 open 态有效.
            onAnimationEnd={onExitAnimationEnd}
        >
            <section className="card crisis-flyout-panel anim-pop" onClick={e => e.stopPropagation()}>
                <h2 id="crisis-flyout-title">危机支持</h2>
                <p className="crisis-lead">如果你此刻感到不安全, 请立即求助. 你不是一个人, 这些渠道随时愿意接住你.</p>
                {/* 内容三块自 CrisisView 原样迁入: 热线卡 (名称/主号/备号/寄语) + 预约入口卡 (判空整卡隐藏) + 110/120 提示. */}
                <section className="crisis-card" aria-label="心理援助热线">
                    <h3>{hotline.name}</h3>
                    <a ref={primaryRef} className="crisis-phone" href={`tel:${hotline.primary}`}>{hotline.primary}</a>
                    <p>备用热线: <a href={`tel:${hotline.backup}`}>{hotline.backup}</a></p>
                    {hotline.message !== '' && <p className="crisis-message">{hotline.message}</p>}
                </section>
                {hotline.appointmentUrl !== '' && (
                    <section className="crisis-card" aria-label="预约心理咨询">
                        <h3>预约学校咨询</h3>
                        <p>
                            <a href={hotline.appointmentUrl} target="_blank" rel="noopener noreferrer">前往预约入口</a>
                        </p>
                    </section>
                )}
                <p className="crisis-emergency">紧急情况 (人身安全受到威胁) 请立即拨打 110 或 120.</p>
                <button type="button" className="btn" onClick={onClose}>我知道了</button>
            </section>
        </div>
    )
}
