//* 会话重命名弹层 (Task 6): 输入型 dialog — 初始值回灌当前标题, 非空且 trimmed 且 <=100 字才可提交,
//* 空值/超长禁用保存钮并给行内提示; 提交上抛 onRename(sessionId, trimmed) (首尾空白不入库).
//* 复用确认模态样式体系 (.confirm-modal/.confirm-modal-panel + Task 5 弹层家族 .pop-origin.enter), z 90
//! 高于会话菜单 (87): 重命名由菜单呼出, 二者互斥换场 (菜单先关弹层后开), 同屏不可能, 90 仅为层级保序.
//* 破坏性默认安全沿 ConfirmModal 惯例: 开启即聚焦输入框, Escape/遮罩/取消 只关不提交, 焦点陷阱闭环 Tab.
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

//* 标题长度上限 (字): 与后端 Task 8 端点校验对齐的展示口径, 提交前前端先拦一道.
const TITLE_MAX = 100

export interface IRenameDialogProps
{
    sessionId: string
    initialTitle: string
    onClose(): void
    onRename(sessionId: string, title: string): void
}

export default function RenameDialog({ sessionId, initialTitle, onClose, onRename }: IRenameDialogProps): ReactElement
{
    const [value, setValue] = useState(initialTitle)
    const rootRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    useFocusTrap(rootRef, true)

    const trimmed = value.trim()
    const tooLong = trimmed.length > TITLE_MAX
    const valid = trimmed !== '' && !tooLong
    //* 行内提示只在不合法时在场: 空白与超长二选一 (互斥分支), 合法态零提示不占版面.
    const hint = trimmed === '' ? '标题不能为空' : (tooLong ? `标题过长, 最多 ${TITLE_MAX} 字` : null)

    //* 开启即聚焦输入框 (ConfirmModal 聚焦取消钮同款惯例): 键盘用户直达改写起点.
    useEffect(() =>
    {
        inputRef.current?.focus()
    }, [])

    //* Escape 关闭: 浮层家族同形, document 级监听随卸载注销.
    useEffect(() =>
    {
        const onKey = (e: KeyboardEvent): void =>
        {
            if(e.key === 'Escape')
                onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const submit = (): void =>
    {
        if(!valid)
            return  //* 禁用态兜底 (编程式触发也不穿透): 校验是唯一入口.
        onRename(sessionId, trimmed)
    }

    return (
        <div
            ref={rootRef}
            className="confirm-modal rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-dialog-title"
            onClick={onClose}
        >
            <section className="card confirm-modal-panel pop-origin enter" onClick={e => e.stopPropagation()}>
                <h2 id="rename-dialog-title">重命名会话</h2>
                <input
                    ref={inputRef}
                    type="text"
                    className="input"
                    aria-label="会话标题"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    //* Enter 即提交 (合法时): 输入型弹层的键盘主路径, 与保存钮同一校验入口.
                    onKeyDown={e =>
                    {
                        if(e.key === 'Enter')
                            submit()
                    }}
                />
                {hint != null && <p className="rename-dialog-hint" role="alert">{hint}</p>}
                <div className="confirm-modal-foot">
                    <button type="button" className="btn pressable" onClick={onClose}>取消</button>
                    <button type="button" className="btn btn-primary pressable" disabled={!valid} onClick={submit}>保存</button>
                </div>
            </section>
        </div>
    )
}
