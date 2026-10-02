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
export function resolveEffectiveMode(mode: ModeName): 'light' | 'dark'
{
    if(mode !== 'system')
        return mode
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function applyTheme(name: ThemeName, mode: ModeName): void
{
    document.documentElement.dataset.theme = name
    document.documentElement.dataset.mode = resolveEffectiveMode(mode)
    localStorage.setItem(THEME_STORAGE_KEY, name)
    localStorage.setItem(MODE_STORAGE_KEY, mode)
}

//* 系统明暗订阅: mode=system 的页面据此实时跟随 OS 切换 (main.tsx 全局订一次, 以存储偏好重应用); 返回退订函数.
export function subscribeSystemMode(callback: (mode: 'light' | 'dark') => void): () => void
{
    const mql = window.matchMedia(DARK_QUERY)
    const handler = (event: MediaQueryListEvent): void => { callback(event.matches ? 'dark' : 'light') }
    mql.addEventListener('change', handler)
    return () => { mql.removeEventListener('change', handler) }
}
