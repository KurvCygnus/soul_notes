//* 主题与外观 (外观定稿): 双主题色板 (雾杉/暮蓝) + 三档明暗模式 (跟随系统/浅色/深色), 挂载点 <html data-theme data-mode>.
//* 双属性均只经本模块写入; tokens.css 按属性对挂载色板 (亮色为基块, 暗色走 [data-theme=X][data-mode="dark"] 高特异性覆盖,
//* 不再依赖 prefers-color-scheme 媒体查询 — 手动覆盖与系统跟随由此统一为同一属性管线).
//* index.html 内联早脚本与本模块共用键名/名单/回退语义 (主题缺失/非法 -> 雾杉, 模式缺失/非法 -> system), 两处必须同步修改;
//* 设置页只经此模块切换, 不直写 localStorage, 保证 DOM 属性与持久化不脱节.

export type ThemeName = 'sage' | 'dusk'

export type ModeName = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'soul.theme'

export const MODE_STORAGE_KEY = 'soul.mode'

export const DEFAULT_THEME: ThemeName = 'sage'

export const DEFAULT_MODE: ModeName = 'system'

//* 合法名单即单一事实: getStored* 的校验与 index.html 早脚本的校验都以此为准.
const THEMES: readonly ThemeName[] = ['sage', 'dusk']

const MODES: readonly ModeName[] = ['system', 'light', 'dark']

//* 系统明暗查询串: 解析与订阅必须命中同一条媒体查询, 抽常量防两处漂移.
const DARK_QUERY = '(prefers-color-scheme: dark)'

//* 三态读取同构: 合法直通, 缺失/非法一律回退默认 (键名与名单由调用方给死, 模块不做任何缓存).
function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T
{
    const stored = localStorage.getItem(key)
    if(stored !== null && (allowed as readonly string[]).includes(stored))
        return stored as T
    return fallback
}

export function getStoredTheme(): ThemeName
{
    return readStored(THEME_STORAGE_KEY, THEMES, DEFAULT_THEME)
}

export function getStoredMode(): ModeName
{
    return readStored(MODE_STORAGE_KEY, MODES, DEFAULT_MODE)
}

//* system 档的落地值只在调用点求值 (早脚本/订阅回调/设置页各取所需), 模块不缓存 OS 状态以免失真.
//* 双源解析 (D1 防御修复): 壳层最近上报 (window.__SoulShell.lastSystemDark) 优先 — 实测定罪 OPPO/ColorOS
//* 会把 WebView 的 prefers-color-scheme 与 AOSP uiMode 解耦钉死 (matchMedia 在真机壳内恒 dark),
//* matchMedia 仅在钩子从未上报 (null/undefined) 时兜底 (纯浏览器/老壳).
export function resolveEffectiveMode(mode: ModeName): 'light' | 'dark'
{
    if(mode !== 'system')
        return mode
    const shellDark = window.__SoulShell?.lastSystemDark
    if(shellDark != null)
        return shellDark ? 'dark' : 'light'
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

//region 壳层系统态推送桥 (D1 防御修复): 安卓壳在 uiMode 变化时经 evaluateJavascript 调用
//* window.__SoulShell.onSystemModeChange(<dark>), 钩子由本模块唯一安装 — 壳推送即记录最近系统态并
//* 触发重应用 (接线在 main.tsx, 与 matchMedia 订阅同参同语义). 纯浏览器无壳时钩子虽在但无人推送,
//* 解析自然落到 matchMedia 兜底, 桥的存在对浏览器形态零影响.
export interface SoulShellBridge
{
    lastSystemDark: boolean | null  //* null = 尚未收到过壳层推送 (推送前 system 档走 matchMedia 兜底).
    onSystemModeChange(dark: boolean): void
}

declare global
{
    interface Window
    {
        __SoulShell?: SoulShellBridge
    }
}

//* 安装钩子 (幂等: 重复安装即整体换新, lastSystemDark 归零重计 — 测试与 HMR 场景不背陈旧态).
export function installShellModeBridge(onChange: () => void): void
{
    window.__SoulShell = {
        lastSystemDark: null,
        onSystemModeChange(dark: boolean): void
        {
            this.lastSystemDark = dark  //* 经 window.__SoulShell?. 方法调用, this 恒为桥对象自身.
            onChange()
        },
    }
}

export function uninstallShellModeBridge(): void
{
    delete window.__SoulShell
}
//endregion

export function applyTheme(name: ThemeName, mode: ModeName): void
{
    const effective = resolveEffectiveMode(mode)
    document.documentElement.dataset.theme = name
    document.documentElement.dataset.mode = effective
    localStorage.setItem(THEME_STORAGE_KEY, name)
    localStorage.setItem(MODE_STORAGE_KEY, mode)
    //* 系统栏上报 (spec §5.3): 安卓壳在 edge-to-edge 下由前端主题驱动系统栏配色;
    //* 纯浏览器无 AndroidShell, 可选链零影响. bg 取已挂属性的实时计算值.
    //* darkIcons 与解析后的生效明暗档绑定 (评审 Important: 原始 mode='system' 时 OS 亮色档会误报暗图标反转).
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    ;(window as { AndroidShell?: { setSystemBar(bg: string, darkIcons: boolean): void } }).AndroidShell?.setSystemBar(bg, effective === 'light')
}

//* 系统明暗订阅: mode=system 的页面据此实时跟随 OS 切换 (main.tsx 全局订一次, 以存储偏好重应用); 返回退订函数.
export function subscribeSystemMode(callback: (mode: 'light' | 'dark') => void): () => void
{
    const mql = window.matchMedia(DARK_QUERY)
    const handler = (event: MediaQueryListEvent): void => { callback(event.matches ? 'dark' : 'light') }
    mql.addEventListener('change', handler)
    return () => { mql.removeEventListener('change', handler) }
}
