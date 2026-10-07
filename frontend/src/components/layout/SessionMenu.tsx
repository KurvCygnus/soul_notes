//* 会话行菜单 (Task 6): 会话行长按/右键呼出的行级弹层, 三项固定 — 置顶(动态文案)/重命名/删除.
//* 分层与家族惯例对齐: 本组件只上抛意图 (onPin/onRename/onDelete), 不触 API 不做确认 —
//* 置顶与重命名的管线归侧栏, 删除沿用 "请求 -> 壳级 ConfirmModal 二次确认" 契约.
//* 常挂载式条件渲染 (调用方条件挂载, 卸载即离场): 入场走 [[.pop-origin.enter]] (Task 5 弹层家族),
//* 出场即时卸载 (浮层家族 "出场无过渡价值" 既有裁定); 触发行定位由调用方算好 x/y 传入, 固定弹出不做跟随.
import { useEffect } from 'react'
import type { ReactElement } from 'react'
import Icon from '../ui/Icon'

export interface ISessionMenuProps
{
    pinned: boolean  //* 当前会话置顶态: 首项文案 置顶/取消置顶 随之换向
    x: number  //* 弹出锚点 (fixed 坐标, 触发行附近), 由调用方按行位置钳取视口后传入
    y: number
    onClose(): void
    onPin(): void
    onRename(): void
    onDelete(): void
}

export default function SessionMenu({ pinned, x, y, onClose, onPin, onRename, onDelete }: ISessionMenuProps): ReactElement
{
    //* Escape 关闭: 仅在场期间挂 document 级监听 (浮层家族同形), 条件挂载下卸载即注销.
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

    //* 条目上抛即关: 动作先于关闭登记, 父层据此推进管线 (置顶 API/重命名弹层/删除确认).
    const run = (action: () => void): void =>
    {
        action()
        onClose()
    }

    return (
        <>
            {/* 透明遮罩收全屏点击: 点菜单外任意处即关, aria-hidden 不进读屏树 (UserMenu 同形). */}
            <div className="session-menu-mask" aria-hidden="true" onClick={onClose} />
            {/* role=menu 三项: 置顶是状态翻转语义 (文案随态换向), 删除以 danger 令牌点出破坏性 (UserMenu 登出同法). */}
            <div className="session-menu pop-origin enter" role="menu" aria-label="会话菜单" style={{ top: y, left: x }}>
                <button type="button" role="menuitem" className="user-menu-item pressable" onClick={() => run(onPin)}>
                    <Icon name="pin" size={15} /><span>{pinned ? '取消置顶' : '置顶'}</span>
                </button>
                <button type="button" role="menuitem" className="user-menu-item pressable" onClick={() => run(onRename)}>
                    <Icon name="pencil" size={15} /><span>重命名</span>
                </button>
                <button type="button" role="menuitem" className="user-menu-item session-menu-danger pressable" onClick={() => run(onDelete)}>
                    <Icon name="trash" size={15} /><span>删除</span>
                </button>
            </div>
        </>
    )
}
