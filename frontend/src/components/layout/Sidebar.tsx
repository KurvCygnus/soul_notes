//* 左栏 (v2 手风琴): 折叠 (48px 图标条) <-> 展开 (260px 内容区), 宽度数值来自产品规格, 颜色走设计令牌 (.sidebar 类).
//* 结构照 spec §5.1/§5.2: 折叠钮 / 扩展节 (总览 + 注册表条目) / 会话节 (新建会话 + 条目列表) / 底部头像行.
//* C1 ADMIN 双裁定 — 分区随角色: ADMIN 只渲染 工作台 + 扩展治理 + 设置 (会话区整体退场, 节名固定治理
//* 语义 "扩展治理"); 非 ADMIN 维持 会话区 (+ COUNSELOR 的工作台入口), 扩展入口对非 ADMIN 整体退场,
//* 与 App.tsx 的 <RequireAdmin>/<ChatRoute> 路由门双侧同闭.
//* 手风琴语义: section 由壳持有 (单一状态, 两节互斥且必有一个展开), 点节标题上抛 onSectionChange 由壳导航
//* sectionRoute; 扩展/总览条目点击由本组件直接导航 — 契约无 onOpenExtension(id), 条目级去向归侧栏, 节级归壳.
//* 访客判定沿旧约: 壳仅对访客传 onOpenLogin, 该 prop 在场即访客态; 侧栏结构照常渲染, 交互上抛壳过登录门.
//* 登录用户的用户名经 useAuth 读取 (契约无 user prop); 删除 × 点击直接上抛 onDeleteSession
//* (语义 = 用户请求删除, 非直接删除 — 二次确认模态归壳 [[ConfirmModal]], Task 11).
//* 会话行左滑删除 (R2): 抽屉展开态行内左滑露出删除钮, 过提交阈值 (-64px) 松手走与点 × 完全相同的
//* 删除确认上抛; 过停靠阈值停靠露钮, 点击行/删除钮或滚动列表复位 — 手势与抽屉级侧滑 (Task 15) 同
//* effect 互斥共存, 仲裁归起滑落点: data-session-id 会话行上起滑归行手势, 非行区域起滑归全域关手势.
//* 抽屉双击空白关 (真机走查改进): 非交互元素上两次轻点即关, 与行/按钮点击互斥 (见双击区注释).
//* 扩展行不参与行内左滑: 单一 button 无删除动作可露.
//* RED 在屏 (收官轮): 壳经 gesturesLocked 总闸冻结抽屉级/行级全部手势, 门禁语义见 prop 注.
//* onOpenCrisis 仍由壳承接: 菜单实体在壳 ([[UserMenu]]), 侧栏汉堡钮 (访客/登录用户两态都在场) 只作开合与 aria 镜像.
//* 会话行重构 (Task 6): 行精简为 仅标题 (.row-title) + 相对时间 (.row-time), 摘要副行退场; pinnedAt 非空
//* 会话独立 "置顶" 节排在前. 行级上下文菜单: 右键 (contextmenu) 或长按 500ms (移动端, 超死区/提前松手作废,
//* 触发时 navigator.vibrate 兜底触感 — 真机触感经壳桥 P3) 呼出 [[SessionMenu]] (置顶/重命名/删除三项目录,
//* 固定弹出不做跟随); 置顶与重命名由侧栏直连会话管理端点并乐观落定本地覆盖层 (接口先行, 端点 Task 8 落地),
//! 删除仍走 "请求 -> 壳级确认" 契约, 本组件绝不直接删; 置顶成功经 FLIP (Task 5 预留 [[.flip-lift]]) 播重排位移.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactElement } from 'react'
import Icon from '../ui/Icon'
import SessionMenu from './SessionMenu'
import RenameDialog from './RenameDialog'
import { pinSession, renameSession } from '../../api/chat'
import { toast } from '../../utils/toast'
import { relTime } from '../../utils/relTime'
import { extensions, overviewProvider } from '../../extensions/registry'
import { sectionRoute } from '../../utils/sidebarSections'
import { useAuth } from '../../hooks/useAuth'
import type { SidebarSection } from '../../utils/sidebarSections'
import type { ChatSessionVo } from '../../types'

//* 偏好键与取值归本组件所有, 壳只经它读初始形态 (AppShell 惰性还原).
export const SIDEBAR_PREF_KEY = 'soul.sidebar'

const WIDTH_COLLAPSED = 48
const WIDTH_EXPANDED = 260

//* 长按呼出菜单 (Task 6) 手感值: 500ms 是移动端长按惯例阈值. 指尖漂移死区直接引用行内左滑的 AXIS_LOCK_SLOP —
//* 两手势共用同一触摸序列, 死区必须同源 (单一常量), "明确滑动" 才能一律归左滑手势, 长按只认原地按住.
const LONG_PRESS_MS = 500

//* FLIP 置顶摘类兜底窗口 (ms, Task 6): 略大于 --dur-enter (220ms, [[.flip-lift]] 的过渡时长) —
//* 正常由 transitionend 摘类, jsdom/极老宿主不触发该事件时由本窗口兜底, 常量两侧注释互指.
const FLIP_CLEAR_MS = 260

//* 会话菜单宽度 (px): 与 base.css .session-menu 同值, 视口钳取时用于把菜单右缘贴齐触发行右缘.
const MENU_WIDTH = 148
//* 会话菜单估高 (px): 三条目 (行高约 36px) + 容器内边距 + 边框的估算值 — 仅用于视口底部空间钳取
//! (把 y 压回行上方), 不追求像素精确; 若菜单条目增删, 此值与 base.css .session-menu 一并核对.
const MENU_HEIGHT = 130

//* 小屏口径判定 (与 CSS 抽屉媒体查询 max-width: 767px 同判, 同手势 effect 内 isMobile 的口径):
//* 抽屉关闭态汉堡钮的 hidden 兜底只在移动端口径生效 — AppShell 无条件下发 drawerOpen/onCloseDrawer,
//* 桌面与"移动端抽屉关闭"在 props 上不可区分, 判定源只能是媒体查询.
//! matchMedia 缺席的老宿主 (jsdom 缺省桩/极老浏览器) 按桌面处理不隐藏: 与手势的"放行"语义刻意相反 —
//* 误藏一个功能钮是可达性事故, 多渲染一个屏外钮只是冗余, 宁可达勿误藏.
function isMobileViewport(): boolean
{
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches
}

//region 移动端侧滑手势常量 (Task 15): 全部为交互手感值, 集中在此便于真机走查统一调档.
//* 关闭态开抽屉的屏幕左缘触发带 (px): 限定左缘窄带, 避免与主区内手势误触 (聊天流无横向手势,
//* 但主区列表项/条目在抽屉外, 开抽屉手势必须只认屏幕最左一列). 关手势无对称触发带 — 已全域化, 见 beginTrack.
const EDGE_OPEN_BAND = 24
//* 松手位移阈值 (px): 超过即按意图提交开/关 (约屏宽 1/6 的滑距).
const COMMIT_DISTANCE = 64
//* 松手速度阈值 (px/ms): 快甩轻滑也提交 (位移不足但速度到位的"甩"手势).
const COMMIT_VELOCITY = 0.5
//* 轴锁死区 (px): 首段位移超过此值才判定横/纵意图 — 纵向让位给列表原生滚动, 侧滑不劫持.
const AXIS_LOCK_SLOP = 10
//* 行内左滑停靠位 (px, R2): 主行内容平移满幅 = 行内删除钮完全露出; 与抽屉级 COMMIT_DISTANCE 同宽,
//* 位移直达此值的松手即越过提交阈值, 直接进删除确认流程 (不停靠).
const ROW_SWIPE_MAX = 64
//* 行内左滑停靠阈值 (px, R2): 松手位移过此值 (但未达提交阈值) 即停靠露钮 — 更低一档, 否则停靠态
//* 无从存在 (过提交阈值直接进删除流程, 未过任何阈值则回弹); 值取提交阈值约 1/3, 手感上"明确左滑"才停.
const ROW_DOCK_DISTANCE = 24
//* 双击关抽屉 (真机走查改进): 两次轻点的最大间隔 (ms) 与落点容差 (px, 兼作单次轻点的起止位移上限) —
//* 间隔过宽或落点漂移超差都按两次独立点按处理, 不构成双击.
const DOUBLE_TAP_INTERVAL = 300
const DOUBLE_TAP_SLOP = 24
//endregion

//* 单指触摸追踪态: touchmove 高频触发, 全程放 ref 进而零重渲染 (transform 直写 aside 内联样式).
interface ITouchTrack
{
    id: number  //* 触点 identifier: 多指时只认起始那一指.
    startX: number
    startY: number
    lastX: number  //* 松手速度用最近一次采样点 (短窗差分), 非全程平均 (平均会稀释甩动速度).
    lastT: number
    axis: 'none' | 'x' | 'y'  //* 轴锁: 首段位移判定后锁定, 纵向即弃置手势.
}

//* 会话行左滑追踪态 (R2): 与抽屉级追踪互斥 (先登记者持有该触摸), 行元素与会话 ID 在起滑时定格 —
//* 列表中途重渲染也不影响在途手势的结算目标.
interface IRowTrack
{
    id: number
    sessionId: string
    row: HTMLElement
    startX: number
    startY: number
    axis: 'none' | 'x' | 'y'
    base: number  //* 起滑时的停靠偏移: 0 = 收起, -ROW_SWIPE_MAX = 已停靠 (跟指位移在基准上叠加).
}

//* 双击关抽屉的轻点快照: touchstart 落点与时刻; interactive 标记起滑目标是否交互元素
//* (button/a/[data-session-id] 命中), 仅在途快照携带, 已落定的 lastTap 恒为非交互点按.
interface ITapSnapshot
{
    x: number
    y: number
    t: number
}

export interface ISidebarProps
{
    section: SidebarSection  //* 当前展开节 (单一状态, 手风琴语义)
    collapsed: boolean
    onSectionChange(section: SidebarSection): void  //* 点节标题 -> 壳导航到 sectionRoute(section)
    onToggleCollapse(): void
    extensionsLabel: string  //* 板块显示名 (部署配置, 壳经 useBrandName 下发, 后端缺省兜底 "扩展");
    //* C1 双裁定后扩展区域收归 ADMIN, 上屏名固定治理语义 "扩展治理" — 本配置仅作为非 ADMIN 分支的取值保留
    //* (非 ADMIN 已无扩展入口, 实际不再渲染, prop 契约保持以兼容壳层下发).
    sessions?: ChatSessionVo[]
    onDeleteSession?(id: string): void
    onOpenSession?(id: string): void
    onNewChat?(): void
    menuOpen: boolean  //* 汉堡菜单开合态 (菜单实体在壳, Task 6), 仅作 aria 状态镜像
    onMenuToggle(): void
    onOpenCrisis(): void  //* 打开危机 Flyout (Task 8 接线, 本任务先留 prop)
    onOpenLogin?(): void  //* 提供即访客态: 头像行显示 登录/注册, 条目交互上抛
    drawerOpen?: boolean  //* <768px 抽屉开合态 (仅驱动 className/遮罩渲染), 缺省即桌面形态
    onCloseDrawer?(): void
    onOpenDrawer?(): void  //* 侧滑手势开抽屉回调 (Task 15): 壳下放 setDrawerOpen(true), 与 onCloseDrawer 同源同态
    gesturesLocked?: boolean  //* 壳级手势总闸 (收官轮裁定): RED 预警弹窗在场时壳下发 true — 抽屉级/行级手势一并冻结.
    //* aside 级监听本被 z100 遮罩物理拦截 (AppShell 旧裁定), 总闸补两件事: 防 stacking 回归的显式门禁;
    //* prop 翻转即重挂手势 effect, 在途手势随清理废弃 + 停靠行复位 (弹窗散后无露钮/半滑行残留).
}

export default function Sidebar({
    section, collapsed, onSectionChange, onToggleCollapse, extensionsLabel,
    sessions, onDeleteSession, onOpenSession, onNewChat, menuOpen, onMenuToggle,
    onOpenLogin, drawerOpen, onCloseDrawer, onOpenDrawer, gesturesLocked,
}: ISidebarProps): ReactElement
{
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const { user } = useAuth()
    const guest = onOpenLogin != null
    //* 工作台入口 (角色门禁): 仅 COUNSELOR/ADMIN 可见 — 读 AuthContext 登录态判定 (访客 user 为 null 天然不可见);
    //* 工作台不是手风琴节 (不动两节互斥状态机), 独立入口行 + 折叠态 rail 图标钮, 点击直接导航 /workbench.
    const isStaff = user?.role === 'COUNSELOR' || user?.role === 'ADMIN'
    //* C1 ADMIN 双裁定 — 侧栏分区随角色: ADMIN 不可用会话, 侧栏只渲染 工作台/扩展治理/设置 三入口
    //* (会话区整体退场); 扩展区域同步收归 ADMIN, 非 ADMIN (访客/STUDENT/COUNSELOR) 不渲染任何扩展入口.
    const isAdmin = user?.role === 'ADMIN'
    //* 扩展节显示名: ADMIN 固定治理语义 "扩展治理" (部署配置的 extensionsLabel 不再上屏 — 治理视角是
    //* 平台语义, 不随品牌文案漂移); 该值仅在 ADMIN 分支被渲染, 非 ADMIN 分支保留表达式以消费 prop 契约.
    const extLabel = isAdmin ? '扩展治理' : extensionsLabel
    const drawer = drawerOpen === true
    const extBase = sectionRoute('extensions')

    //* 折叠切换持久化: 先按当前形态计算去向再落盘, 壳据此翻转 React 态 (存储所有权在组件, 壳只管渲染).
    const handleToggle = (): void =>
    {
        localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? 'expanded' : 'collapsed')
        onToggleCollapse()
    }

    //* 折叠图标列点节图标 = 展开侧栏并切到对应节 (双上抛, 壳负责导航).
    const expandTo = (next: SidebarSection): void =>
    {
        onSectionChange(next)
        onToggleCollapse()
    }

    const sidebarClass = ['sidebar', collapsed ? 'collapsed' : '', drawer ? 'drawer-open' : ''].
        filter(Boolean).
        join(' ')

    //* 汉堡钮 (头像行右槽): 开合态归壳持有, 菜单实体在壳 ([[UserMenu]] id 对应 aria-controls);
    //* 访客同样渲染 (红线: 危机入口对访客可达, 壳对访客菜单隐藏登出/门保护项过门), 两态共用同一按钮形态.
    //* 抽屉关闭态补 hidden (冒烟走查改进): 移动端抽屉关闭时 aside 整体滑出屏外, CSS visibility:hidden
    //! 有过渡延迟窗口且 jsdom/无 CSS 宿主不生效 — DOM 层 hidden 与渲染条件同源兜底防读屏/键盘误达
    //* 屏外按钮; 桌面口径 (isMobileViewport false) 与抽屉展开态不受影响, 配套 CSS 见 base.css [hidden] 规则.
    const menuHidden = isMobileViewport() && !drawer
    const menuButton = (
        <button
            type="button"
            className="sidebar-menu pressable"
            aria-label="打开菜单"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="user-menu"
            onClick={onMenuToggle}
            hidden={menuHidden}
        >
            <Icon name="menu" size={17} />
        </button>
    )

    //* 条目选中态: 当前路由即该扩展页 (总览 = /extensions, 条目 = /extensions/:id), 淡品牌底由 CSS 承载.
    //* pressable (Task 5): 扩展行是单一 button 本体即行, 按压缩放直接挂行 — 会话行的挂点在主行按钮 (见下),
    //! 刻意不挂 li: 行内左滑手势跟指写内联 transform 于主行, 内联样式天然压过 :active 缩放, 手势期零视觉打架;
    //! 若挂 li 则触摸滑动期间整行 (含删除钮) 处于 :active 缩放态, 跟指位移叠加整行缩放, 视觉噪声不可接受.
    const rowClass = (target: string): string => (pathname === target ? 'sidebar-row active' : 'sidebar-row') + ' pressable'

    //* 会话行左滑 (R2) 合成 click 抑制旗: 锁轴滑动松手后浏览器可能仍派发一次合成 click (大位移不必然被
    //* 判为拖拽), 旗用后即焚 (行内 onClick 消费) 且行内下一次 touchstart 即作废 — 只吞紧随滑动的那一次.
    //* 声明前置: Task 6 的 renderRow 在本 region 之前定义并消费此旗 (声明后置会触发 React 编译器 immutability 误报).
    const rowSwipeGuardRef = useRef(false)

    //* 行内左滑 DOM 复位 (手势结算与行内 onClick 共用): 清跟指内联位移并归还令牌过渡, 摘停靠类.
    const resetRowSwipe = (row: Element | null): void =>
    {
        if(row == null)
            return
        const main = row.querySelector<HTMLElement>('.sidebar-row-main')
        if(main != null)
        {
            main.style.transition = ''
            main.style.transform = ''
        }
        row.classList.remove('swiped')
    }

    //region 会话行重构 (Task 6): 仅标题行 / 置顶分组 / 上下文菜单 / 重命名 / FLIP
    //* 乐观覆盖层 (接口先行, 端点 Task 8 落地): pinSession/renameSession 成功后本地落定, 下次壳层 reload
    //* (真实端点就绪后) 自然被服务端事实覆盖 — 键缺席即回退 props 原值, 覆盖层对存量数据零侵入.
    const [pinOverrides, setPinOverrides] = useState<Record<string, string | null>>({})
    const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({})
    //* 行级菜单与重命名弹层的开合态: 菜单记弹出锚点 (fixed 坐标, 固定弹出不做跟随), 重命名记目标会话.
    const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
    const [renameTarget, setRenameTarget] = useState<{ sessionId: string; initialTitle: string } | null>(null)

    //* 派生视图: 覆盖层并入 props 列表后按 pinnedAt 二分 (置顶在前, 两节内相对顺序稳定 — 稳定分桶不重排,
    //* 服务端排序语义不被前端二次发明); sessions 缺席 (折叠/访客) 时整体缺席.
    const viewSessions = useMemo(() =>
    {
        if(sessions == null)
            return null
        const merged = sessions.map(s => ({
            ...s,
            title: titleOverrides[s.sessionId] ?? s.title ?? null,
            pinnedAt: s.sessionId in pinOverrides ? pinOverrides[s.sessionId] : (s.pinnedAt ?? null),
        }))
        return {
            merged,
            pinned: merged.filter(s => s.pinnedAt != null),
            rest: merged.filter(s => s.pinnedAt == null),
        }
    }, [sessions, pinOverrides, titleOverrides])
    const menuSession = menu == null ? null : (viewSessions?.merged.find(s => s.sessionId === menu.id) ?? null)

    //* 行内定位 (与壳层 findSessionRow 同款锚): 扁平遍历 dataset 匹配, 会话 id 不经 CSS.escape 也可靠.
    const findRow = (id: string): HTMLElement | null =>
    {
        const aside = asideRef.current
        if(aside == null)
            return null
        const rows = aside.querySelectorAll<HTMLElement>('.sidebar-row[data-session-id]')
        for(const row of rows)
        {
            if(row.dataset.sessionId === id)
                return row
        }
        return null
    }

    //* 菜单弹出定位: 触发行右缘对齐 + 行顶稍下 — 固定弹出即可, 不做跟随 (任务口径). 双向钳取留 8px 呼吸边:
    //* 横向钳左缘, 纵向按 MENU_HEIGHT 估高钳视口底 — 底部空间不足时 y 被压回行顶之上, 菜单就地向上弹.
    const openMenuAtRow = useCallback((row: HTMLElement): void =>
    {
        const rect = row.getBoundingClientRect()
        const viewportW = typeof window === 'undefined' ? 0 : window.innerWidth
        const viewportH = typeof window === 'undefined' ? 0 : window.innerHeight
        setMenu({
            id: row.dataset.sessionId ?? '',
            x: Math.max(8, Math.min(rect.right - MENU_WIDTH, viewportW - MENU_WIDTH - 8)),
            y: Math.max(8, Math.min(rect.top, viewportH - MENU_HEIGHT - 8)),
        })
    }, [setMenu])  //* setter 引用稳定性由 React 契约保证, 编译器依赖推断要求显式在列.

    //* FLIP 簿记 (Task 5 预留类接线): pin 触发时定格行位 (First, flipFromRef), 服务端响应落定覆盖层的
    //* 同一轮 setState 里投递 flipTarget — 由它驱动 layout effect 在重排提交后测量行位 (Last) 并施加
    //! 反向偏移 (Invert). 刻意不按 ref + 空依赖 effect 消费: 置顶动作本身也触发一次渲染 (菜单关闭),
    //! 空依赖 effect 会在重排前的旧节点上白白消费簿记, 且行跨节移动是重挂载 (旧节点带走的内联样式全废).
    const [flipTarget, setFlipTarget] = useState<{ id: string; from: number } | null>(null)
    const flipFromRef = useRef(0)
    useLayoutEffect(() =>
    {
        if(flipTarget == null)
            return
        // oxlint-disable-next-line react/set-state-in-effect //! 消费即复位是一次性的簿记清理: state 是"重排已提交"的唯一信号 (异步 then 无法在提交后时机触发), 复位引发的单次空渲染成本可忽略.
        setFlipTarget(null)
        const row = findRow(flipTarget.id)
        if(row == null)
            return  //! 行已不在场 (并发删除/卸载): 无从翻转, 放弃动画即可.
        const delta = flipTarget.from - row.getBoundingClientRect().top
        row.style.transition = 'none'  //* Invert 期脱离令牌过渡, 否则偏移本身被动画化.
        row.style.transform = `translateY(${delta}px)`
        //! 强制样式重算 (I1 评审): Invert 的 transform 写入与下一帧 Play 的清除之间必须有一次布局冲刷 —
        //! 否则两次写入被浏览器合并成一次样式变更, 前后 computed transform 均为 none, transition 永不触发
        //! (真实浏览器静默失效; jsdom 无布局测不出, 由测试里的写入顺序探针钉住 reflow 的存在).
        void row.getBoundingClientRect()
        const play = (): void =>
        {
            row.style.transition = ''
            row.style.transform = ''
            row.classList.add('flip-lift')  //* Play: 归位位移交回 .flip-lift 的令牌过渡.
            const clear = (): void =>
            {
                row.classList.remove('flip-lift')
                row.removeEventListener('transitionend', clear)
            }
            row.addEventListener('transitionend', clear)
            window.setTimeout(clear, FLIP_CLEAR_MS)  //! 兜底摘类: jsdom/极老宿主不触发 transitionend, 不兜则类滞留.
        }
        if(typeof requestAnimationFrame !== 'function')
        {
            play()  //* 无 rAF 宿主 (极老浏览器): 跳过动画帧直接落终态, 干净优先.
            return
        }
        requestAnimationFrame(() => play())
    }, [flipTarget])

    //* 置顶翻转: 服务端按当前态翻转并返回新 pinnedAt — 前端不自行推断, 一律以响应落定覆盖层.
    const handlePin = useCallback((id: string): void =>
    {
        const row = findRow(id)
        if(row != null)
            flipFromRef.current = row.getBoundingClientRect().top  //* First: 重排前行位定格.
        pinSession(id).
            then(({ pinnedAt }) =>
            {
                setPinOverrides(prev => ({ ...prev, [id]: pinnedAt ?? null }))
                setFlipTarget({ id, from: flipFromRef.current })  //* 覆盖层与 FLIP 目标同轮提交: layout effect 见到的必是重排后的新节点.
            }).
            catch(() => toast('置顶失败, 请稍后再试.', 'error'))  //* 失败不投递 flipTarget: 列表原样, 无动画可播.
    }, [])

    //* 重命名提交: 弹层提交即关 (成败后行, 失败走 toast), 成功后标题落定覆盖层.
    const handleRename = useCallback((sessionId: string, title: string): void =>
    {
        setRenameTarget(null)
        renameSession(sessionId, title).
            then(() => { setTitleOverrides(prev => ({ ...prev, [sessionId]: title })) }).
            catch(() => toast('重命名失败, 请稍后再试.', 'error'))
    }, [setRenameTarget, setTitleOverrides])  //* setter 引用稳定性由 React 契约保证, 编译器依赖推断要求显式在列.

    //* 会话行渲染 (置顶节与普通节共用同一行形态): 行 = 主按钮 (.row-title ellipsis + .row-time 相对时间,
    //* 摘要副行退场) + 删除 ×; 无标题会话以预览充当身份名 (aria 与展示同口径, 与旧版主行判定一致).
    const renderRow = (s: ChatSessionVo): ReactElement =>
    {
        const label = s.title ?? s.preview
        return (
            //* data-session-id: 行内左滑手势 (委托在 aside) 结算时定位会话身份的锚; contextmenu 亦挂行本体.
            <li
                key={s.sessionId}
                className="sidebar-row"
                data-session-id={s.sessionId}
                onContextMenu={e =>
                {
                    e.preventDefault()  //* 掐掉浏览器原生右键菜单, 让位行级会话菜单.
                    openMenuAtRow(e.currentTarget)
                }}
            >
                <button
                    type="button"
                    className="sidebar-row-main pressable"
                    onClick={(e) =>
                    {
                        if(rowSwipeGuardRef.current)
                        {
                            rowSwipeGuardRef.current = false  //* 只吞紧随滑动的那一次合成 click (一次触摸至多派发一次), 用后即焚不误伤后续真实点击.
                            return
                        }
                        const row = e.currentTarget.closest('.sidebar-row')
                        if(row != null && row.classList.contains('swiped'))
                        {
                            resetRowSwipe(row)  //* 停靠态点行 = 复位露钮优先, 不顺带打开会话 (双义取复位).
                            return
                        }
                        onOpenSession?.(s.sessionId)
                    }}
                >
                    <span className="row-title">{label}</span>
                    <span className="row-time">{relTime(s.lastUpdateTime)}</span>
                </button>
                <button
                    type="button"
                    className="sidebar-del pressable"
                    aria-label={`删除会话: ${label}`}  //* 标题优先: aria 名应是会话的身份名, 预览 (末条消息) 只是无标题时的兜底 (与上方主行判定同口径).
                    onClick={(e) =>
                    {
                        if(rowSwipeGuardRef.current)
                        {
                            rowSwipeGuardRef.current = false  //* 同主行: 滑动提交后落在删除钮上的合成 click 只吞一次, 不得二次触发删除请求.
                            return
                        }
                        resetRowSwipe(e.currentTarget.closest('.sidebar-row'))  //* 点删除钮即复位露钮 (确认流程与停靠态解耦).
                        onDeleteSession?.(s.sessionId)
                    }}
                >
                    ×
                </button>
            </li>
        )
    }
    //endregion

    //region 移动端侧滑手势 (Task 15): 抽屉打开时全域左滑关闭 (会话行让位行内手势), 关闭态从屏幕左缘右滑打开.
    const asideRef = useRef<HTMLElement | null>(null)
    const closeTrack = useRef<ITouchTrack | null>(null)
    const openTrack = useRef<ITouchTrack | null>(null)
    const rowTrack = useRef<IRowTrack | null>(null)

    useEffect(() =>
    {
        if(typeof window === 'undefined')
            return  //! SSR/无 window 宿主短路: 监听器只允许存在于浏览器环境 (测试跑 jsdom 同样受此保护).
        const aside = asideRef.current
        if(aside == null)
            return
        //* 小屏口径与 CSS 抽屉媒体查询 (max-width: 767px) 对齐: 宽屏触屏设备不启手势, 否则滑动会错翻壳层
        //* drawerOpen 态 (桌面 CSS 不渲染抽屉, 状态却换了向). matchMedia 缺席的老宿主按放行处理 (宁多勿漏).
        const isMobile = (): boolean =>
            typeof window.matchMedia !== 'function' || window.matchMedia('(max-width: 767px)').matches
        const firstTouch = (e: TouchEvent): Touch | null => (e.changedTouches[0] ?? null)
        const touchById = (e: TouchEvent, id: number): Touch | null =>
        {
            for(let i = 0; i < e.changedTouches.length; i++)
            {
                const t = e.changedTouches[i]
                if(t.identifier === id)
                    return t
            }
            return null
        }
        //* 清内联样式: 松手/弃置时归还视觉控制权 — 后续滑出/滑入/回弹一律交回 CSS 类 + 动效令牌过渡.
        const clearInline = (): void =>
        {
            const el = asideRef.current
            if(el == null)
                return
            el.style.transition = ''
            el.style.transform = ''
            el.style.visibility = ''
        }
        //* 起滑登记: 单指限定 + 开/关各自只认自己的抽屉态; 开手势限屏幕左缘窄带, 关手势全域 (除会话行),
        //* 通过后让 aside 脱离过渡进入跟指.
        const beginTrack = (e: TouchEvent, wantOpen: boolean): ITouchTrack | null =>
        {
            if(closeTrack.current != null || openTrack.current != null || rowTrack.current != null || e.touches.length !== 1)
                return null  //* 单指手势: 已在追踪 (含行内左滑, R2 互斥裁决) 或多指捏合一律忽略.
            if(gesturesLocked === true)
                return null  //* 手势总闸 (RED 在屏): 开/关两向一并冻结 — 显式门禁兜 stacking 回归, 不独赖遮罩物理拦截.
            if(wantOpen === drawer)
                return null  //* 开手势只认关闭态, 关手势只认打开态 (互斥, 也挡掉跨节点冒泡的重复登记).
            if(wantOpen ? onOpenDrawer == null : onCloseDrawer == null)
                return null
            if(!isMobile())
                return null
            const t = firstTouch(e)
            if(t == null)
                return null
            if(wantOpen)
            {
                if(t.clientX > EDGE_OPEN_BAND)
                    return null  //* 开手势只认屏幕最左窄带: 主区深处的横滑与本手势无关.
            }
            else
            {
                //* 关手势全域化 (真机走查整改): 触发带 = 整个抽屉区域 — 旧左缘窄带 (40px) 与提交位移 (64px)
                //* 数学互斥, 带内起滑的最大可达位移被屏幕边界截断, 慢滑永远够不到阈值只能回弹 (真机实锤).
                //* 唯一让位: 会话行 (data-session-id 在场) 上起滑归行内左滑删除手势 — 两手势同向同阈值,
                //* 不仲裁则行内露钮/删除永远被关抽屉截胡; 扩展行等非会话行照常全域关.
                const target = e.target
                if(target instanceof Element && target.closest('.sidebar-row[data-session-id]') != null)
                    return null
            }
            const el = asideRef.current
            if(el != null)
                el.style.transition = 'none'  //* 跟指期脱离令牌过渡, 否则动画追不上手指.
            return { id: t.identifier, startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: e.timeStamp, axis: 'none' }
        }
        //* 轴锁推进: 首段显著位移判定横/纵意图, 纵向即弃置 (让位给列表/聊天流的原生滚动), 横向返回位移.
        const advance = (track: ITouchTrack, t: Touch): number | null =>
        {
            if(track.axis === 'y')
                return null
            const dx = t.clientX - track.startX
            const dy = t.clientY - track.startY
            if(track.axis === 'none')
            {
                if(Math.abs(dx) < AXIS_LOCK_SLOP && Math.abs(dy) < AXIS_LOCK_SLOP)
                    return null
                track.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
                if(track.axis === 'y')
                {
                    clearInline()
                    return null
                }
            }
            return dx
        }
        //* 松手结算: 位移或瞬时速度达阈值即提交开/关; 先清内联再上抛, 抽屉从当前跟指位置被类规则接手过渡.
        const settle = (track: ITouchTrack, t: Touch, timeStamp: number, wantClose: boolean): void =>
        {
            const dx = wantClose ? Math.min(0, t.clientX - track.startX) : Math.max(0, t.clientX - track.startX)
            const dt = timeStamp - track.lastT
            const vx = dt > 0 ? (t.clientX - track.lastX) / dt : 0  //* 短窗差分速度: 平均速度会稀释"甩"的意图.
            const passed = track.axis === 'x' &&
                (wantClose ? dx <= -COMMIT_DISTANCE || vx <= -COMMIT_VELOCITY : dx >= COMMIT_DISTANCE || vx >= COMMIT_VELOCITY)
            clearInline()
            if(!passed)
                return  //* 未达标: 原地回弹/归位, 状态不动.
            if(wantClose)
                onCloseDrawer?.()
            else
                onOpenDrawer?.()
        }
        const onAsideTouchStart = (e: TouchEvent): void =>
        {
            const track = beginTrack(e, false)
            if(track != null)
                closeTrack.current = track
        }
        const onDocTouchStart = (e: TouchEvent): void =>
        {
            const track = beginTrack(e, true)
            if(track != null)
                openTrack.current = track
        }
        const onAsideTouchMove = (e: TouchEvent): void =>
        {
            const track = closeTrack.current
            if(track == null)
                return
            const t = touchById(e, track.id)
            if(t == null)
                return
            const dx = advance(track, t)
            if(dx == null || track.axis !== 'x')
                return
            track.lastX = t.clientX
            track.lastT = e.timeStamp
            const el = asideRef.current
            if(el != null)
                el.style.transform = `translateX(${Math.min(0, dx)}px)`  //* 只跟左滑 (负向), 右推顶回原位.
        }
        const onDocTouchMove = (e: TouchEvent): void =>
        {
            const track = openTrack.current
            if(track == null)
                return
            const t = touchById(e, track.id)
            if(t == null)
                return
            const dx = advance(track, t)
            if(dx == null || track.axis !== 'x')
                return
            track.lastX = t.clientX
            track.lastT = e.timeStamp
            const el = asideRef.current
            if(el != null)
            {
                el.style.visibility = 'visible'  //! 关闭态抽屉是 visibility:hidden, 预览必须内联翻回可见 (优先级高于类规则, 松手统一清理).
                el.style.transform = `translateX(calc(-105% + ${Math.max(0, dx)}px))`  //* 从屏外泊位起算, 只跟右滑.
            }
        }
        const onAsideTouchEnd = (e: TouchEvent): void =>
        {
            const track = closeTrack.current
            closeTrack.current = null
            if(track == null)
                return
            const t = touchById(e, track.id)
            if(t == null)
                clearInline()
            else
                settle(track, t, e.timeStamp, true)
        }
        const onDocTouchEnd = (e: TouchEvent): void =>
        {
            const track = openTrack.current
            openTrack.current = null
            if(track == null)
                return
            const t = touchById(e, track.id)
            if(t == null)
                clearInline()
            else
                settle(track, t, e.timeStamp, false)
        }
        const onAsideTouchCancel = (): void =>
        {
            closeTrack.current = null
            clearInline()  //* 系统打断 (来电/手势冲突): 原位归位不提交.
        }
        const onDocTouchCancel = (): void =>
        {
            openTrack.current = null
            clearInline()
        }
        //region 双击关抽屉 (真机走查改进): 抽屉打开态, 非交互元素上两次轻点 (间隔 < DOUBLE_TAP_INTERVAL,
        //* 各自起止位移与相互落点都在 DOUBLE_TAP_SLOP 内) 即上抛关抽屉 — 与全域左滑互补的第三条关抽屉出路.
        //* 与行/按钮点击互斥: 起滑目标命中 button/a/[data-session-id] 的点按完全不参与累计 (双击行的语义
        //* 归行自身), 交互元素起滑也不清场 — 空白-按钮-空白的连击不得因中间那击按钮而意外凑成双击.
        //* 状态用 effect 闭包变量而非 ref: 只被本 effect 的监听读写, 零重渲染, 且随依赖翻转重挂一并废弃.
        let tapStart: (ITapSnapshot & { interactive: boolean }) | null = null
        let lastTap: ITapSnapshot | null = null
        const withinTapSlop = (ax: number, ay: number, bx: number, by: number): boolean =>
        {
            const dx = ax - bx
            const dy = ay - by
            return dx * dx + dy * dy <= DOUBLE_TAP_SLOP * DOUBLE_TAP_SLOP  //* 平方距离判容差, 免开方.
        }
        const onAsideTapStart = (e: TouchEvent): void =>
        {
            if(!drawer || gesturesLocked === true || !isMobile() || e.touches.length !== 1)
            {
                tapStart = null  //* 双击与抽屉级/行级手势同门禁: 抽屉未开/RED 在屏/宽屏/多指一律不累计.
                return
            }
            const t = firstTouch(e)
            if(t == null)
                return
            const target = e.target
            tapStart = {
                x: t.clientX,
                y: t.clientY,
                t: e.timeStamp,
                interactive: target instanceof Element && target.closest('button, a, [data-session-id]') != null,
            }
        }
        const onAsideTapEnd = (e: TouchEvent): void =>
        {
            const start = tapStart
            tapStart = null
            if(start == null)
                return
            if(start.interactive)
                return  //* 交互元素上的点按: 不参与累计也不清场 (语义归元素自身).
            const t = firstTouch(e)
            if(t == null)
                return
            if(!withinTapSlop(t.clientX, t.clientY, start.x, start.y))
            {
                lastTap = null  //* 起止位移超差 = 滑动而非轻点: 双击累计清零 (滑一下不得接续凑成双击).
                return
            }
            const prev = lastTap
            lastTap = { x: t.clientX, y: t.clientY, t: e.timeStamp }
            if(prev == null || !withinTapSlop(t.clientX, t.clientY, prev.x, prev.y) || e.timeStamp - prev.t >= DOUBLE_TAP_INTERVAL)
                return  //* 无前击/落点漂移超差/间隔过宽: 记为本轮首击, 等下一击.
            lastTap = null  //* 双击成立即消费累计: 三连击只关一次, 不会连环触发.
            onCloseDrawer?.()
        }
        //endregion
        //* 全量复位: 清所有会话行的停靠/跟指残留 (滚动复位与 effect 清理共用, 对干净行是空操作).
        //* except: 单行停靠语义 — 新行起滑时排除自身 (新停靠不复位自己, 自己的停靠基准已随 base 定格),
        //* 其余行一并回弹: 同屏至多一行露删除钮, 避免多行破坏性按钮同时暴露 (移动端列表滑动惯例).
        const resetAllDockedRows = (root: HTMLElement, except?: Element | null): void =>
        {
            root.querySelectorAll('.sidebar-row').forEach(row => { if(row !== except) resetRowSwipe(row) })
        }
        //region 会话行左滑删除手势 (R2): 委托在 aside 上 (行随列表重渲染, 逐行挂监听会反复注销), 与抽屉级
        //* 手势同一触摸互斥 — 抽屉级监听注册在前且 beginTrack/起滑均查对方追踪态, 先登记者持有该触摸.
        //* 只认会话行 (data-session-id 在场): 扩展行是单一 button 且无删除动作, 不参与本手势.
        const beginRowTrack = (e: TouchEvent): IRowTrack | null =>
        {
            if(!drawer || !isMobile())
                return null  //* 抽屉展开态 + 移动端口径才起手势 (与 CSS 抽屉媒体查询同门禁).
            if(gesturesLocked === true)
                return null  //* 手势总闸 (RED 在屏): 行左滑不起手势 — 不跟指不停靠不提交, RED 弹窗在屏期间零手势.
            if(closeTrack.current != null || openTrack.current != null || rowTrack.current != null)
                return null  //* 互斥兜底: 同一触摸已被抽屉级登记 (非行区域全域起滑) 时行内让位 — 关手势全域化后
                //* 行区域起滑根本不进抽屉级登记 (beginTrack 让位裁决), 本查询保留作多监听场景的登记互斥.
            if(e.touches.length !== 1)
                return null
            const target = e.target
            if(!(target instanceof Element))
                return null
            const row = target.closest('.sidebar-row')
            if(!(row instanceof HTMLElement) || row.dataset.sessionId == null)
                return null
            const t = firstTouch(e)
            if(t == null)
                return null
            resetAllDockedRows(aside, row)  //* 单行停靠语义: 起滑命中即复位其他停靠行 (排除自身, 见 resetAllDockedRows 注).
            return {
                id: t.identifier,
                sessionId: row.dataset.sessionId,
                row,
                startX: t.clientX,
                startY: t.clientY,
                axis: 'none',
                base: row.classList.contains('swiped') ? -ROW_SWIPE_MAX : 0,
            }
        }
        //* 行内轴锁推进: 与抽屉级同死区, 纵向即弃置并清跟指内联 (滚动让位, 不 preventDefault).
        const advanceRow = (track: IRowTrack, t: Touch): number | null =>
        {
            if(track.axis === 'y')
                return null
            const dx = t.clientX - track.startX
            const dy = t.clientY - track.startY
            if(track.axis === 'none')
            {
                if(Math.abs(dx) < AXIS_LOCK_SLOP && Math.abs(dy) < AXIS_LOCK_SLOP)
                    return null
                track.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
                if(track.axis === 'y')
                {
                    resetRowSwipe(track.row)
                    return null
                }
            }
            return dx
        }
        //* 行内松手结算: 过提交阈值 (-64px) 即走与点删除钮同一的上抛 (壳层 pendingDeleteId 确认);
        //* 过停靠阈值停靠露钮; 未过停靠阈值原地回弹. 位移以起滑时基准 (收起/停靠) 叠加, 停靠位满幅夹取.
        const settleRow = (track: IRowTrack, t: Touch): void =>
        {
            if(track.axis !== 'x')
                return  //* 未锁轴 (轻点) 或纵向弃置: 触摸语义交还 click/滚动, 停靠行的轻点复位归 onClick.
            rowSwipeGuardRef.current = true  //! 锁轴滑动的松手随附合成 click: 一律抑制, 防误开会话/二次删除.
            const raw = track.base + (t.clientX - track.startX)
            if(raw <= -COMMIT_DISTANCE)
            {
                resetRowSwipe(track.row)  //* 提交即复位: 确认弹层在场时行不再停靠.
                onDeleteSession?.(track.sessionId)
                return
            }
            const main = track.row.querySelector<HTMLElement>('.sidebar-row-main')
            if(main == null)
                return
            main.style.transition = ''  //* 内联过渡归还: 回弹/停靠动画交回 CSS 类上的 --dur-fast/--ease-enter.
            if(raw <= -ROW_DOCK_DISTANCE)
            {
                main.style.transform = `translateX(${-ROW_SWIPE_MAX}px)`  //* 停靠满幅露钮, 复位归点击行/删除钮/滚动.
                track.row.classList.add('swiped')
            }
            else
                resetRowSwipe(track.row)
        }
        const onRowTouchStart = (e: TouchEvent): void =>
        {
            const target = e.target
            if(target instanceof Element && target.closest('.sidebar-row') != null)
                rowSwipeGuardRef.current = false  //* 行上新触摸即作废陈旧抑制旗: 只吞紧随滑动的那一次合成 click.
            const track = beginRowTrack(e)
            if(track != null)
                rowTrack.current = track
        }
        const onRowTouchMove = (e: TouchEvent): void =>
        {
            const track = rowTrack.current
            if(track == null)
                return
            const t = touchById(e, track.id)
            if(t == null)
                return
            const dx = advanceRow(track, t)
            if(dx == null || track.axis !== 'x')
                return
            const main = track.row.querySelector<HTMLElement>('.sidebar-row-main')
            if(main != null)
            {
                main.style.transition = 'none'  //* 跟指期脱离令牌过渡, 否则动画追不上手指.
                const offset = Math.min(0, Math.max(-ROW_SWIPE_MAX, track.base + dx))  //* 只跟左滑, 右推顶回收起位.
                main.style.transform = offset === 0 ? '' : `translateX(${offset}px)`
            }
        }
        const onRowTouchEnd = (e: TouchEvent): void =>
        {
            const track = rowTrack.current
            rowTrack.current = null
            if(track == null)
                return
            const t = touchById(e, track.id)
            if(t == null)
                resetRowSwipe(track.row)
            else
                settleRow(track, t)
        }
        const onRowTouchCancel = (): void =>
        {
            const track = rowTrack.current
            rowTrack.current = null
            if(track != null)
                resetRowSwipe(track.row)  //* 系统打断 (来电/手势冲突): 原位归位不提交不停靠.
        }
        //* 滚动即放弃露钮: scroll 不冒泡, 必须直挂滚动容器 (.sidebar-body 恒在, 是 aside 直接子节点).
        const onBodyScroll = (): void =>
        {
            if(asideRef.current != null)
                resetAllDockedRows(asideRef.current)
        }
        //endregion
        //* 全程 passive 且从不 preventDefault: 跟指纯靠 transform 重绘, 不阻断浏览器默认行为 (轴锁后纵向照常滚动).
        //! 若未来需要在 touchmove 里 preventDefault, 监听必须显式改挂 { passive: false }, 否则 Chrome 会静默忽略.
        const opts: AddEventListenerOptions = { passive: true }
        aside.addEventListener('touchstart', onAsideTouchStart, opts)
        aside.addEventListener('touchmove', onAsideTouchMove, opts)
        aside.addEventListener('touchend', onAsideTouchEnd, opts)
        aside.addEventListener('touchcancel', onAsideTouchCancel, opts)
        document.addEventListener('touchstart', onDocTouchStart, opts)
        document.addEventListener('touchmove', onDocTouchMove, opts)
        document.addEventListener('touchend', onDocTouchEnd, opts)
        document.addEventListener('touchcancel', onDocTouchCancel, opts)
        aside.addEventListener('touchstart', onAsideTapStart, opts)
        aside.addEventListener('touchend', onAsideTapEnd, opts)
        //* 行内监听注册在抽屉级之后: 同目标同阶段监听按注册序回调, 保证同触摸时抽屉级手势先登记 (优先级更高).
        aside.addEventListener('touchstart', onRowTouchStart, opts)
        aside.addEventListener('touchmove', onRowTouchMove, opts)
        aside.addEventListener('touchend', onRowTouchEnd, opts)
        aside.addEventListener('touchcancel', onRowTouchCancel, opts)
        const body = aside.querySelector('.sidebar-body')
        if(body != null)
            body.addEventListener('scroll', onBodyScroll, opts)
        return () =>
        {
            aside.removeEventListener('touchstart', onAsideTouchStart, opts)
            aside.removeEventListener('touchmove', onAsideTouchMove, opts)
            aside.removeEventListener('touchend', onAsideTouchEnd, opts)
            aside.removeEventListener('touchcancel', onAsideTouchCancel, opts)
            document.removeEventListener('touchstart', onDocTouchStart, opts)
            document.removeEventListener('touchmove', onDocTouchMove, opts)
            document.removeEventListener('touchend', onDocTouchEnd, opts)
            document.removeEventListener('touchcancel', onDocTouchCancel, opts)
            aside.removeEventListener('touchstart', onAsideTapStart, opts)
            aside.removeEventListener('touchend', onAsideTapEnd, opts)
            aside.removeEventListener('touchstart', onRowTouchStart, opts)
            aside.removeEventListener('touchmove', onRowTouchMove, opts)
            aside.removeEventListener('touchend', onRowTouchEnd, opts)
            aside.removeEventListener('touchcancel', onRowTouchCancel, opts)
            if(body != null)
                body.removeEventListener('scroll', onBodyScroll, opts)
            closeTrack.current = null
            openTrack.current = null
            rowTrack.current = null  //* 在途手势随重挂一并废弃: 依赖翻转 (总闸/抽屉态) 中途起的手势不得被新监听结算 —
            //* RED 在屏瞬间正有手指在滑时, 此处截断提交/停靠窗口 (内联样式已由下方两行归零).
            clearInline()  //* 依赖变化重挂/卸载时清掉可能残留的跟指内联样式, 不给后续渲染留脏状态.
            resetAllDockedRows(aside)  //* 行内同法: 抽屉关闭/重挂时复位停靠与跟指残留, 不留滑开一半的行.
        }
    }, [drawer, onCloseDrawer, onOpenDrawer, onDeleteSession, gesturesLocked])
    //endregion

    //region 长按呼出菜单 (Task 6, I2/M3 评审轮后置于手势区: 需作废在途 rowTrack)
    //* 触屏路径: 500ms 定时, 指尖漂移超死区 (滚动/左滑意图) 或提前松手即作废; 触发时 navigator.vibrate?.(20)
    //* 兜底触感 (可选链: 无宿主 API 静默, 真机触感归壳桥 P3). 与行内左滑手势共存不互斥: 左滑的轴锁跟指位移
    //* 必然先超死区把长按掐灭, 原地按住才轮到本手势; 反向 (长按成局后在途行手势) 的作废见定时器回调.
    useEffect(() =>
    {
        if(typeof window === 'undefined')
            return  //! SSR/无 window 宿主短路 (行手势 effect 同款保护).
        const aside = asideRef.current
        if(aside == null)
            return
        let timer: number | null = null
        let press: { id: number; x: number; y: number; row: HTMLElement } | null = null
        const cancel = (): void =>
        {
            if(timer != null)
            {
                clearTimeout(timer)
                timer = null
            }
            press = null
        }
        const touchById = (e: TouchEvent, id: number): Touch | null =>
        {
            for(const t of e.changedTouches)
            {
                if(t.identifier === id)
                    return t
            }
            return null
        }
        const onTouchStart = (e: TouchEvent): void =>
        {
            if(gesturesLocked === true)
                return  //* 手势总闸 (RED 在屏): 长按同冻结 — 弹窗压屏期零手势.
            if(e.touches.length !== 1)
                return  //* 单指限定: 多指捏合不构成长按.
            const target = e.target
            if(!(target instanceof Element))
                return
            const row = target.closest<HTMLElement>('.sidebar-row[data-session-id]')
            const t = e.changedTouches[0]
            if(row == null || t == null)
                return
            cancel()  //* 新触摸作废陈旧计时: 单点语义, 只认最后按住的那一指.
            press = { id: t.identifier, x: t.clientX, y: t.clientY, row }
            timer = window.setTimeout(() =>
            {
                timer = null
                const p = press
                press = null
                if(p == null)
                    return
                navigator.vibrate?.(20)
                rowSwipeGuardRef.current = true  //! 合成 click 抑制 (I2 评审): 长按松手随附的 click 若落回行按钮,
                //! 会立刻误开会话 (菜单遮罩只接得住落点在遮罩上的那次); 旗由行 onClick "用后即焚 + 下次 touchstart 作废" 逻辑消费.
                rowTrack.current = null  //! 在途行手势一并作废 (M3 评审): 长按成局后原地继续左滑不得在菜单在屏时跟指/提交删除;
                resetRowSwipe(p.row)  //* 已写下的跟指内联位移随之复位, 菜单在屏期行保持原位.
                openMenuAtRow(p.row)
            }, LONG_PRESS_MS)
        }
        const onTouchMove = (e: TouchEvent): void =>
        {
            const p = press
            if(p == null || timer == null)
                return
            const t = touchById(e, p.id)
            if(t == null)
                return
            const dx = t.clientX - p.x
            const dy = t.clientY - p.y
            if(dx * dx + dy * dy > AXIS_LOCK_SLOP * AXIS_LOCK_SLOP)
                cancel()  //* 指尖漂移超死区 = 滚动/滑动意图 (死区与行内左滑轴锁同源, M1 评审): 平方距离判容差, 免开方.
        }
        const onTouchEnd = (): void => { cancel() }  //* 提前松手/系统打断: 轻点语义归 click, 计时作废.
        const opts: AddEventListenerOptions = { passive: true }
        aside.addEventListener('touchstart', onTouchStart, opts)
        aside.addEventListener('touchmove', onTouchMove, opts)
        aside.addEventListener('touchend', onTouchEnd, opts)
        aside.addEventListener('touchcancel', onTouchEnd, opts)
        return () =>
        {
            cancel()  //* 总闸翻转/卸载重挂在途计时一并作废, 不给后续渲染留孤儿定时器.
            aside.removeEventListener('touchstart', onTouchStart, opts)
            aside.removeEventListener('touchmove', onTouchMove, opts)
            aside.removeEventListener('touchend', onTouchEnd, opts)
            aside.removeEventListener('touchcancel', onTouchEnd, opts)
        }
    }, [gesturesLocked, openMenuAtRow])
    //endregion

    return (
        <>
            {/* 抽屉遮罩: 仅抽屉态渲染, 点击即关 (Escape 关闭归壳); 桌面端该节点根本不出现, 无回归面.
                //! 必须是 aside 的兄弟而非子节点 — aside 滑入动画带 transform, 会使子级 position:fixed
                //! 退化为相对 aside 包含块, 遮罩只盖住抽屉自身, 内容区裸奔且点外侧关闭失效 (真机走查实锤). */}
            {drawer && onCloseDrawer != null && (
                <div className="drawer-overlay" aria-hidden="true" onClick={onCloseDrawer} />
            )}
            <aside ref={asideRef} className={sidebarClass} style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}>
                <button
                type="button"
                className="sidebar-toggle pressable"
                aria-expanded={!collapsed}
                aria-controls="sidebar-body"
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                onClick={handleToggle}
            >
                <Icon name="panel" size={17} className={collapsed ? 'icon-rot' : undefined} />
            </button>
            {drawer && onCloseDrawer != null && (
                //* 抽屉头部显式关闭钮 (R1 走查整改): 全屏化后抽屉盖住壳层顶栏汉堡, 左上角面板钮只翻 collapsed
                //* 不关抽屉 — 全屏态需要一条可见的关抽屉出路. 仅抽屉态挂载 (桌面/收起态无此节点, 形态侧再由
                //* .sidebar-close 的 display:none 双保险), 职责与折叠钮不重叠: 本钮只上抛关抽屉.
                <button type="button" className="sidebar-close pressable" aria-label="关闭菜单" onClick={onCloseDrawer}>
                    <Icon name="close" size={17} />
                </button>
            )}
            <div id="sidebar-body" className="sidebar-body">
                {collapsed ? (
                    <nav className="sidebar-rail" aria-label="侧栏快捷入口">
                        {isStaff && (
                            <button type="button" className="sidebar-mini pressable" aria-label="工作台" title="工作台" onClick={() => navigate('/workbench')}>
                                <Icon name="gauge" size={17} />
                            </button>
                        )}
                        {isAdmin && (
                            //* C1: 扩展治理图标仅 ADMIN (非 ADMIN 的扩展入口整体退场).
                            <button type="button" className="sidebar-mini pressable" aria-label={extLabel} title={extLabel} onClick={() => expandTo('extensions')}>
                                <Icon name="grid" size={17} />
                            </button>
                        )}
                        {isAdmin && (
                            //* C1: ADMIN 无会话区, rail 以 设置 钮补位 (会话/新建会话两钮仅非 ADMIN 渲染).
                            <button type="button" className="sidebar-mini pressable" aria-label="设置" title="设置" onClick={() => navigate('/settings')}>
                                <Icon name="sliders" size={17} />
                            </button>
                        )}
                        {!isAdmin && (
                            <button type="button" className="sidebar-mini pressable" aria-label="会话" title="会话" onClick={() => expandTo('sessions')}>
                                <Icon name="chat" size={17} />
                            </button>
                        )}
                        {!isAdmin && (
                            <button type="button" className="sidebar-mini pressable" aria-label="新建会话" title="新建会话" onClick={() => onNewChat?.()}>
                                {/* 纯加号: 收起态与 chat 气泡拉开区分度 (走查裁决, 展开态有文字仍用 chat-plus). //! JSX 子节点内 //* 不是注释而是文本, 会漏染 UI — 注释必须走大括号花括号形式. */}
                                <Icon name="plus" size={17} />
                            </button>
                        )}
                    </nav>
                ) : (
                    <>
                        {isStaff && (
                            //* 工作台独立入口 (角色门禁): 行形态复用扩展条目同款 (icon + 行名 + pathname 选中态),
                            //* 不参与手风琴两节互斥 — 直达路由的常驻入口, 与节标题无 aria 关联.
                            <nav className="sidebar-section" aria-label="工作台">
                                <div className="sidebar-items">
                                    <button type="button" className={rowClass('/workbench')} onClick={() => navigate('/workbench')}>
                                        <Icon name="gauge" size={16} />
                                        <span className="sidebar-row-name">工作台</span>
                                    </button>
                                </div>
                            </nav>
                        )}
                        {isAdmin && (
                            //* C1: 扩展节仅 ADMIN 渲染, 节名固定治理语义 (extLabel = "扩展治理").
                            <section className="sidebar-section">
                                <button
                                    type="button"
                                    className="sidebar-section-title pressable"
                                    aria-expanded={section === 'extensions'}
                                    aria-controls="sidebar-section-extensions"
                                    onClick={() => onSectionChange('extensions')}
                                >
                                    <Icon name="grid" size={16} />
                                    <span className="sidebar-section-name">{extLabel}</span>
                                    <Icon name="chevron" size={14} className="sidebar-section-arrow" />
                                </button>
                                {section === 'extensions' && (
                                    <div id="sidebar-section-extensions" className="sidebar-items">
                                        {overviewProvider != null && (
                                            <button type="button" className={rowClass(extBase)} onClick={() => navigate(extBase)}>
                                                <Icon name={overviewProvider.icon} size={16} />
                                                <span className="sidebar-row-name">总览</span>
                                            </button>
                                        )}
                                        {extensions.map((e) => (
                                            <button
                                                key={e.id}
                                                type="button"
                                                className={rowClass(`${extBase}/${e.id}`)}
                                                onClick={() => navigate(`${extBase}/${e.id}`)}
                                            >
                                                <Icon name={e.icon} size={16} />
                                                <span className="sidebar-row-name">{e.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                        {isAdmin && (
                            //* C1: ADMIN 无会话区, 侧栏以 设置 行补位 (导航 /settings, 与汉堡菜单的设置项同去向).
                            <nav className="sidebar-section" aria-label="设置">
                                <div className="sidebar-items">
                                    <button type="button" className={rowClass('/settings')} onClick={() => navigate('/settings')}>
                                        <Icon name="sliders" size={16} />
                                        <span className="sidebar-row-name">设置</span>
                                    </button>
                                </div>
                            </nav>
                        )}
                        {!isAdmin && (
                            //* C1: 会话节对 ADMIN 整体退场 (含节标题/新建会话/行列表) — ADMIN 不可用会话.
                            <section className="sidebar-section">
                                <button
                                    type="button"
                                    className="sidebar-section-title pressable"
                                    aria-expanded={section === 'sessions'}
                                    aria-controls="sidebar-section-sessions"
                                    onClick={() => onSectionChange('sessions')}
                                >
                                    <Icon name="chat" size={16} />
                                    <span className="sidebar-section-name">会话</span>
                                    <Icon name="chevron" size={14} className="sidebar-section-arrow" />
                                </button>
                                {section === 'sessions' && (
                                    <div id="sidebar-section-sessions" className="sidebar-items">
                                        <button type="button" className="sidebar-new pressable" onClick={() => onNewChat?.()}>
                                            <Icon name="chat-plus" size={16} />
                                            新建会话
                                        </button>
                                        {viewSessions == null || viewSessions.merged.length === 0 ? (
                                            <p className="sidebar-empty">还没有会话, 想聊的时候随时开始.</p>
                                        ) : (
                                            <>
                                                {/* 置顶节 (Task 6): pinnedAt 非空会话独立分组排在前, 节标题沿用弱化标签模式 (非交互, 无 hover 反馈). */}
                                                {viewSessions.pinned.length > 0 && (
                                                    <div className="sidebar-pinned">
                                                        <p className="sidebar-pinned-label">置顶</p>
                                                        <ul className="sidebar-list sidebar-pinned-list">
                                                            {viewSessions.pinned.map(renderRow)}
                                                        </ul>
                                                    </div>
                                                )}
                                                {viewSessions.rest.length > 0 && (
                                                    <ul className="sidebar-list">
                                                        {viewSessions.rest.map(renderRow)}
                                                    </ul>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </section>
                        )}
                    </>
                )}
            </div>
            {/* 会话行级菜单与重命名弹层 (Task 6): 条件挂载 (卸载即离场), 挂 aside 兄弟位避免其 transform
                包含块问题; 菜单目标会话已不在派生列表 (并发删除) 时整体不渲染即视为关闭. */}
            {menu != null && menuSession != null && (
                <SessionMenu
                    pinned={menuSession.pinnedAt != null}
                    x={menu.x}
                    y={menu.y}
                    onClose={() => setMenu(null)}
                    onPin={() => handlePin(menu.id)}
                    onRename={() =>
                    {
                        setMenu(null)  //* 菜单先关弹层后开: 两浮层互斥不同屏 (层级保序见 RenameDialog 注).
                        setRenameTarget({ sessionId: menu.id, initialTitle: menuSession.title ?? '' })
                    }}
                    onDelete={() => onDeleteSession?.(menu.id)}  //* 语义 = 请求删除: 确认模态归壳 (Task 11 契约), 菜单关闭由 SessionMenu 收口.
                />
            )}
            {renameTarget != null && (
                <RenameDialog
                    sessionId={renameTarget.sessionId}
                    initialTitle={renameTarget.initialTitle}
                    onClose={() => setRenameTarget(null)}
                    onRename={handleRename}
                />
            )}
            {/* 底部头像行: 登录用户 = 头像+用户名+汉堡钮, 访客 = 登录/注册 (折叠态缩为 "登录" 以适配 48px). */}
            <div className="sidebar-foot">
                {guest ? (
                    //* 访客双件套 (D18 结构照常): 姓名槽让位给登录钮, 汉堡照常在场 (危机入口红线, T6 评审整改).
                    //* 无 aria-label: 可访问名直接取可见文本, 折叠态 ("登录") 与展开态 ("登录 / 注册") 名实一致.
                    <>
                        <button type="button" className="sidebar-login pressable" onClick={onOpenLogin}>
                            {collapsed ? '登录' : '登录 / 注册'}
                        </button>
                        {menuButton}
                    </>
                ) : (
                    <>
                        <span className="sidebar-avatar" aria-hidden="true">{(user?.username ?? '').charAt(0)}</span>
                        <span className="sidebar-username">{user?.username}</span>
                        {menuButton}
                    </>
                )}
            </div>
        </aside>
        </>
    )
}
