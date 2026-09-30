//* 汉堡用户菜单 (spec §7): 头像行锚点向上弹出的浮层, 条目固定顺序 — 危机支持置顶且公开 (红线: 访客可达热线, 无门),
//* 登录用户的门保护项由壳导航, 登出走壳的登出链. 开合态归壳持有 (侧栏汉堡钮仅作 aria 镜像), 本组件只管菜单实体:
//* 遮罩点击与 Escape 关闭, 条目全部上抛壳处理, 菜单自身不触碰路由与认证上下文 (分层裁决).
import { useEffect } from 'react'
import type { ReactElement } from 'react'

export interface IUserMenuProps
{
    guest: boolean  //* 访客态: 门保护项 (个人资料/设置/关于) 改由壳过登录门, 登出隐藏 (无意义); 危机支持照常公开.
    onClose(): void
    onOpenCrisis(): void
    onOpenProfile(): void
    onOpenSettings(): void
    onOpenAbout(): void
    onLogout(): void
}

export default function UserMenu({
    guest, onClose, onOpenCrisis, onOpenProfile, onOpenSettings, onOpenAbout, onLogout,
}: IUserMenuProps): ReactElement
{
    //* Escape 关闭: 仅菜单在场期间挂 document 级监听, 卸载即注销 (与抽屉/登录浮层同形);
    //! 抽屉与菜单可同屏 (移动端抽屉内点汉堡), Escape 会双双关闭 — 两浮层同源同向, 无抢占问题.
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

    return (
        <>
            {/* 透明遮罩收全屏点击: 点菜单外任意处即关 (含侧栏本体), aria-hidden 使其不进读屏树. */}
            <div className="user-menu-mask" aria-hidden="true" onClick={onClose} />
            {/* id 与侧栏汉堡钮的 aria-controls 对应; 定位右下 (头像行上方) 归 CSS, 进场动效走动效令牌 (D23). */}
            <div id="user-menu" className="user-menu" role="menu" aria-label="用户菜单">
                {/* 顺序即 spec §7: 危机支持置顶并以 danger 令牌点出安全语义; 登出仅登录用户可见 (夹在设置与关于之间). */}
                <button type="button" role="menuitem" className="user-menu-item user-menu-item-crisis" onClick={onOpenCrisis}>危机支持</button>
                <button type="button" role="menuitem" className="user-menu-item" onClick={onOpenProfile}>个人资料</button>
                <button type="button" role="menuitem" className="user-menu-item" onClick={onOpenSettings}>设置</button>
                {!guest && <button type="button" role="menuitem" className="user-menu-item" onClick={onLogout}>登出</button>}
                <button type="button" role="menuitem" className="user-menu-item" onClick={onOpenAbout}>关于</button>
            </div>
        </>
    )
}
