//* 主题名与持久化 (D24): 双主题色板切换, 挂载点 <html data-theme>.
//* index.html 内联早脚本与本模块共用同一键名/名单/回退语义 (缺失/非法 -> 雾杉), 两处必须同步修改;
//* 设置页 (Task 6) 只经此模块切换, 不直写 localStorage, 保证 data-theme 与持久化不脱节.

export type ThemeName = 'sage' | 'dusk'

export const THEME_STORAGE_KEY = 'soul.theme'

export const DEFAULT_THEME: ThemeName = 'sage'

//* 合法名单即单一事实: getStoredTheme 的校验与 index.html 早脚本的校验都以此为准.
const THEMES: readonly ThemeName[] = ['sage', 'dusk']

export function getStoredTheme(): ThemeName
{
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if(stored !== null && (THEMES as readonly string[]).includes(stored))
        return stored as ThemeName
    return DEFAULT_THEME
}

export function applyTheme(name: ThemeName): void
{
    document.documentElement.dataset.theme = name
    localStorage.setItem(THEME_STORAGE_KEY, name)
}
