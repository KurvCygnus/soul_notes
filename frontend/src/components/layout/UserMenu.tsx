//* 汉堡用户菜单 (spec §7): 头像行锚点向上弹出的浮层, 条目固定顺序 — 危机支持置顶且公开 (红线: 访客可达热线, 无门),
//* 登录用户的门保护项由壳导航, 登出走壳的登出链. 开合态归壳持有 (侧栏汉堡钮仅作 aria 镜像), 本组件只管菜单实体:
//* 遮罩点击与 Escape 关闭, 条目全部上抛壳处理, 菜单自身不触碰路由与认证上下文 (分层裁决).
//* 退场动画 (走查裁决 2026-10-03): open 翻假后续挂一轮淡出 (遮罩即时消失, 菜单本体淡出), useExitAnimation 簿记.
import { useEffect, useRef } from 'react'
import type { AnimationEvent, ReactElement } from 'react'
import Icon from '../ui/Icon'
import { useExitAnimation } from '../../hooks/useExitAnimation'

export interface IUserMenuProps
{
    open: boolean  //* 壳持有的开合态: 常驻挂载 (退场动画簿记), 本组件自渲染 null.
    guest: boolean  //* 访客态: 门保护项改由壳过登录门; 个人资料对访客隐藏 (无账号无资料可言, 走查裁决 2026-10-03), 登出隐藏; 危机支持照常公开.
    onClose(): void
    onOpenCrisis(): void
    onOpenProfile(): void
    onOpenSettings(): void
    onLogout(): void
}

export default function UserMenu({
    open, guest, onClose, onOpenCrisis, onOpenProfile, onOpenSettings, onLogout,
}: IUserMenuProps): ReactElement | null
{
    const { mounted, closing, markExited } = useExitAnimation(open)
    const menuRef = useRef<HTMLDivElement>(null)

    //* Escape 关闭: 仅菜单在场期间挂 document 级监听, 卸载即注销 (与抽屉/登录浮层同形);
    //! 抽屉与菜单可同屏 (移动端抽屉内点汉堡), Escape 会双双关闭 — 两浮层同源同向, 无抢占问题.
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

    const onExitAnimationEnd = (e: AnimationEvent<HTMLDivElement>): void =>
    {
        if(closing && e.target === e.currentTarget && e.animationName === 'overlay-exit')
            markExited()
    }

    if(!mounted)
        return null

    return (
        <>
            {/* 透明遮罩收全屏点击: 点菜单外任意处即关 (含侧栏本体), aria-hidden 使其不进读屏树; 退场期即时消失. */}
            {open && <div className="user-menu-mask" aria-hidden="true" onClick={onClose} />}
            {/* id 与侧栏汉堡钮的 aria-controls 对应; 定位右下 (头像行上方) 归 CSS, 进场动效走动效令牌 (D23). */}
            <div
                ref={menuRef}
                id="user-menu"
                className={`user-menu${closing ? ' closing' : ''}`}
                role="menu"
                aria-label="用户菜单"
                onAnimationEnd={onExitAnimationEnd}
            >
                {/* 顺序即 spec §7: 危机支持置顶并以 danger 令牌点出安全语义; 个人资料登录态限定 (走查裁决);
                    关于项随独立路由一并退场 (设置页关于区块是唯一关于信息源, 走查裁决 2026-10-03). */}
                <button type="button" role="menuitem" className="user-menu-item user-menu-item-crisis" onClick={onOpenCrisis}><Icon name="buoy" size={15} /><span>危机支持</span></button>
                {!guest && <button type="button" role="menuitem" className="user-menu-item" onClick={onOpenProfile}><Icon name="user" size={15} /><span>个人资料</span></button>}
                <button type="button" role="menuitem" className="user-menu-item" onClick={onOpenSettings}><Icon name="sliders" size={15} /><span>设置</span></button>
                {!guest && <button type="button" role="menuitem" className="user-menu-item user-menu-item-logout" onClick={onLogout}><Icon name="logout" size={15} /><span>登出</span></button>}
            </div>
        </>
    )
}
