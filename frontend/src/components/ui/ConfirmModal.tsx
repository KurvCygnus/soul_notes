//* 删除确认模态 (Task 11, D17 无预览契约): 取代已删除的 window.confirm 流 — 原生 confirm 暴露页面 URL
//* 且预览文案不可控, 本组件内容一律由调用方以 props 传入 (壳传固定文案), 且刻意不提供 children/预览插槽,
//* 会话内容绝不在此渲染 (删除 × 的 aria-label 已含预览, 模态内不再复读). role=alertdialog: 破坏性确认语义.
//* 破坏性默认安全: 开启即聚焦取消钮 (误按 Enter/Space 落在安全侧), Escape 与遮罩点击同为取消,
//* 确认只上抛 onConfirm 恰一次, 关闭裁决归壳 (组件不自作主张) — 失败时壳可让会话保留并提示.
//* 退场动画 + 焦点陷阱 (走查裁决 2026-10-03): useExitAnimation 淡出卸载, Tab 循环限制在模态内.
import { useEffect, useRef } from 'react'
import type { AnimationEvent, ReactElement } from 'react'
import { useExitAnimation } from '../../hooks/useExitAnimation'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export interface IConfirmModalProps
{
    open: boolean
    title: string
    body: string
    confirmText?: string  //* 确认钮文案 (壳传 "删除"; 缺省 "确认")
    danger?: boolean  //* 破坏性操作: 确认钮以 --danger 令牌点出危险色
    onClose(): void
    onConfirm(): void
}

export default function ConfirmModal({
    open, title, body, confirmText = '确认', danger = false, onClose, onConfirm,
}: IConfirmModalProps): ReactElement | null
{
    const { mounted, closing, markExited } = useExitAnimation(open)
    const rootRef = useRef<HTMLDivElement>(null)
    useFocusTrap(rootRef, open && !closing)
    const cancelRef = useRef<HTMLButtonElement>(null)

    const onExitAnimationEnd = (e: AnimationEvent<HTMLDivElement>): void =>
    {
        if(closing && e.target === e.currentTarget && e.animationName === 'overlay-exit')
            markExited()
    }

    //* 焦点管理 (CrisisFlyout 同形): open 翻真时先存触发元素再聚焦取消钮 (破坏性默认安全); 关闭时还原焦点.
    //! 触发元若已随上游卸载则跳过还原, 不强塞焦点给已离场节点.
    useEffect(() =>
    {
        if(!open)
            return
        const previous = document.activeElement
        cancelRef.current?.focus()
        return () =>
        {
            if(previous instanceof HTMLElement && previous.isConnected)
                previous.focus()
        }
    }, [open])

    //* Escape = 取消: 仅在场期间挂 document 级监听, 关闭/卸载即注销 (浮层家族同形).
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
        //* 遮罩即 dialog 实体 (CrisisFlyout 同形): 点遮罩任意非面板处取消, 面板内 stopPropagation 截停冒泡.
        <div
            ref={rootRef}
            className={`confirm-modal${closing ? ' closing' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-body"
            onClick={open ? onClose : undefined}  //* 退场期掐交互.
            onAnimationEnd={onExitAnimationEnd}
        >
            <section className="card confirm-modal-panel anim-pop" onClick={e => e.stopPropagation()}>
                <h2 id="confirm-modal-title">{title}</h2>
                <p id="confirm-modal-body">{body}</p>
                <div className="confirm-modal-foot">
                    <button ref={cancelRef} type="button" className="btn" onClick={onClose}>取消</button>
                    <button
                        type="button"
                        className={danger ? 'btn confirm-modal-danger' : 'btn'}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </section>
        </div>
    )
}
