//* 浮层焦点陷阱 (走查裁决 2026-10-03, a11y 家族首项): 模态在场的 Tab/Shift+Tab 循环限制在浮层内部,
//* 防焦点逸出到被遮罩的背景内容. 焦点初值与还原归各浮层既有逻辑 (open 翻真聚焦主元素, 关闭还原), 本陷阱只管 Tab 循环.
//* 消费方: LoginSheet/CrisisFlyout/ConfirmModal/RedAlertModal 四个模态; UserMenu 是 menu 语义 (Escape/遮罩已闭环) 不在列.
import { useEffect } from 'react'
import type { RefObject } from 'react'

//* 七参选择器: 可聚焦形态的全集 (浮层内部无 display:none 的动态禁用项场景, 不做可见性过滤 — jsdom 无布局, 过滤在全环境都失真).
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(rootRef: RefObject<HTMLElement | null>, active: boolean): void
{
    useEffect(() =>
    {
        if(!active)
            return
        const onKey = (e: KeyboardEvent): void =>
        {
            if(e.key !== 'Tab')
                return
            const root = rootRef.current
            if(root == null)
                return
            const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
            if(focusables.length === 0)
            {
                e.preventDefault()  //* 浮层内无可聚焦元素: 焦点宁可原地不动也不逸出.
                return
            }
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            const current = document.activeElement
            const inside = current != null && root.contains(current)
            if(!inside)
            {
                e.preventDefault()
                first.focus()  //* 焦点已逸出 (如点击遮罩文本): 拉回浮层首位.
            }
            else if(e.shiftKey && current === first)
            {
                e.preventDefault()
                last.focus()
            }
            else if(!e.shiftKey && current === last)
            {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [active, rootRef])
}
