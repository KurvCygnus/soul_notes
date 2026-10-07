//* 主题与外观工具测试 (D24 + 外观定稿): 主题读取三态契约 (合法直通, 缺失/非法回退雾杉) 不变;
//* 外观模式三态同构 (合法直通, 缺失/非法回退 system), system 档经 matchMedia 解析为具体档位上 DOM 而存储仍存 system,
//* 订阅契约: 注册 change 监听随 OS 翻转回调 light/dark, 退订即静默 — matchMedia 桩见 [[installMatchMediaStub]].
//* 键名 'soul.theme'/'soul.mode' 同时被 index.html 内联早脚本消费 (防 FOUC), 两处逻辑必须保持一致.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    applyTheme,
    DEFAULT_MODE,
    DEFAULT_THEME,
    getStoredMode,
    getStoredTheme,
    installShellModeBridge,
    MODE_STORAGE_KEY,
    resolveEffectiveMode,
    subscribeSystemMode,
    THEME_STORAGE_KEY,
    uninstallShellModeBridge,
} from './theme'
import { installMatchMediaStub } from '../test/matchMedia'

describe('getStoredTheme (主题读取三态)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
    })

    it('合法值原样返回', () =>
    {
        localStorage.setItem(THEME_STORAGE_KEY, 'sage')
        expect(getStoredTheme()).toBe('sage')
        localStorage.setItem(THEME_STORAGE_KEY, 'dusk')
        expect(getStoredTheme()).toBe('dusk')
    })

    it('缺失回退默认雾杉', () =>
    {
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
        expect(getStoredTheme()).toBe(DEFAULT_THEME)
        expect(getStoredTheme()).toBe('sage')
    })

    it('非法值回退默认雾杉', () =>
    {
        localStorage.setItem(THEME_STORAGE_KEY, 'purple')
        expect(getStoredTheme()).toBe('sage')
    })
})

describe('getStoredMode (外观读取三态)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
    })

    it('合法值原样返回 (system/light/dark)', () =>
    {
        for(const mode of ['system', 'light', 'dark'] as const)
        {
            localStorage.setItem(MODE_STORAGE_KEY, mode)
            expect(getStoredMode()).toBe(mode)
        }
    })

    it('缺失回退默认跟随系统', () =>
    {
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBeNull()
        expect(getStoredMode()).toBe(DEFAULT_MODE)
        expect(getStoredMode()).toBe('system')
    })

    it('非法值回退默认跟随系统', () =>
    {
        localStorage.setItem(MODE_STORAGE_KEY, 'sepia')
        expect(getStoredMode()).toBe('system')
    })
})

describe('applyTheme (双属性应用与持久化)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        document.documentElement.removeAttribute('data-theme')
        document.documentElement.removeAttribute('data-mode')
    })

    it('写 data-theme 与 data-mode 双属性到 <html>, 并分别落 soul.theme / soul.mode', () =>
    {
        applyTheme('dusk', 'dark')
        expect(document.documentElement.dataset.theme).toBe('dusk')
        expect(document.documentElement.dataset.mode).toBe('dark')
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dusk')
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('dark')
    })

    it('system 档经 matchMedia 解析为具体档位上 DOM, 存储仍存 system (跟随语义不被固化)', () =>
    {
        installMatchMediaStub(true)
        applyTheme('sage', 'system')
        expect(document.documentElement.dataset.theme).toBe('sage')
        expect(document.documentElement.dataset.mode).toBe('dark')
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('system')
    })

    it('system 档亮系统解析为 light', () =>
    {
        installMatchMediaStub(false)
        applyTheme('sage', 'system')
        expect(document.documentElement.dataset.mode).toBe('light')
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('system')
    })
})

describe('resolveEffectiveMode (system 档解析)', () =>
{
    it('system -> 取 matchMedia 当前值, light/dark -> 原样直通', () =>
    {
        const stub = installMatchMediaStub(true)
        expect(resolveEffectiveMode('system')).toBe('dark')
        stub.flip(false)
        expect(resolveEffectiveMode('system')).toBe('light')
        expect(resolveEffectiveMode('light')).toBe('light')
        expect(resolveEffectiveMode('dark')).toBe('dark')
    })
})

describe('subscribeSystemMode (系统明暗实时跟随)', () =>
{
    it('注册 change 监听, OS 翻转时回调收到 dark/light', () =>
    {
        const stub = installMatchMediaStub(false)
        const callback = vi.fn()
        const unsubscribe = subscribeSystemMode(callback)
        expect(stub.listenerCount).toBe(1)

        stub.flip(true)
        expect(callback).toHaveBeenCalledWith('dark')
        stub.flip(false)
        expect(callback).toHaveBeenCalledWith('light')
        unsubscribe()
    })

    it('退订后监听移除, 翻转不再回调', () =>
    {
        const stub = installMatchMediaStub(true)
        const callback = vi.fn()
        const unsubscribe = subscribeSystemMode(callback)
        unsubscribe()
        expect(stub.listenerCount).toBe(0)

        stub.flip(false)
        expect(callback).not.toHaveBeenCalled()
    })
})

//region 壳层系统态推送桥 (D1 防御修复): 安卓壳经 window.__SoulShell.onSystemModeChange 前推真实夜间态,
//* "跟随系统"解析升级双源 — 壳层最近上报优先 (真机 ColorOS 把 WebView 的 matchMedia 与 AOSP uiMode
//* 解耦钉死, matchMedia 不可信), matchMedia 只作钩子缺席兜底. 本区域钉住四条契约: 推送 dark 切深色 /
//* 推送 light 切浅色 / 钩子缺席回退 matchMedia / 手动档不受推送影响. 接线与 main.tsx 逐字同形.
describe('window.__SoulShell (壳层系统态推送桥)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        uninstallShellModeBridge()  //* 桥状态不跨用例残留: 每例从"钩子缺席"的干净底盘起装.
    })
    afterEach(() =>
    {
        uninstallShellModeBridge()
    })

    it('推送 dark=true: system 档切深色 (matchMedia 恒亮下生效值翻 dark, 证明壳源优先于兜底)', () =>
    {
        installMatchMediaStub(false)  //* matchMedia 恒亮: 若解析翻 dark 只可能来自壳层推送, 源归属可断言.
        localStorage.setItem(MODE_STORAGE_KEY, 'system')
        //* 与 main.tsx 逐字同形的接线: 推送回调以存储偏好整体重应用.
        installShellModeBridge(() => applyTheme(getStoredTheme(), getStoredMode()))
        applyTheme(getStoredTheme(), getStoredMode())  //* 推送前: 兜底 matchMedia 生效 (亮档).
        expect(document.documentElement.dataset.mode).toBe('light')

        window.__SoulShell?.onSystemModeChange(true)
        expect(document.documentElement.dataset.mode).toBe('dark')
    })

    it('推送 light=false: system 档切浅色', () =>
    {
        installMatchMediaStub(true)  //* matchMedia 恒暗: 推送前兜底解析为 dark, 推送后必须被壳源反转.
        localStorage.setItem(MODE_STORAGE_KEY, 'system')
        installShellModeBridge(() => applyTheme(getStoredTheme(), getStoredMode()))
        applyTheme(getStoredTheme(), getStoredMode())
        expect(document.documentElement.dataset.mode).toBe('dark')

        window.__SoulShell?.onSystemModeChange(false)
        expect(document.documentElement.dataset.mode).toBe('light')
    })

    it('钩子缺席 (纯浏览器/老壳): system 档回退 matchMedia', () =>
    {
        expect(window.__SoulShell).toBeUndefined()
        const stub = installMatchMediaStub(true)
        expect(resolveEffectiveMode('system')).toBe('dark')
        stub.flip(false)
        expect(resolveEffectiveMode('system')).toBe('light')
    })

    it('手动档不受推送影响: 推送只重应用存储偏好, light/dark 手动值原样保持', () =>
    {
        installMatchMediaStub(false)
        localStorage.setItem(MODE_STORAGE_KEY, 'light')
        installShellModeBridge(() => applyTheme(getStoredTheme(), getStoredMode()))
        applyTheme(getStoredTheme(), getStoredMode())

        window.__SoulShell?.onSystemModeChange(true)
        expect(document.documentElement.dataset.mode).toBe('light')  //* 手动亮档不被壳推送翻成深色.
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('light')  //* 跟随语义不被固化, 存储仍存手动档.
    })
})
//endregion

//region 系统栏上报契约 (spec §5.3): 安卓壳经 window.AndroidShell.setSystemBar(bg, darkIcons) 由前端主题驱动系统栏配色.
//* applyTheme 每次调用 (手动切换/冷启动/matchMedia 变化重应用) 都收口在同一处上报 — 本区域用测试钉住:
//* 参数契约 (bg 取计算 --bg, darkIcons 与生效亮档绑定) / "跟随系统"经 matchMedia 变化路径的重报
//* (main.tsx 的 subscribeSystemMode(()->applyTheme(...)) 接线, 此处以逐字同形组合钉住) / 壳缺席静默.
interface ISystemBarCall { bg: string; darkIcons: boolean }

//* 上报桥桩: 记录调用参数供断言.
function stubAndroidShell(): { calls: ISystemBarCall[] }
{
    const shell = { calls: [] as ISystemBarCall[] }
    vi.stubGlobal('AndroidShell', { setSystemBar: (bg: string, darkIcons: boolean) => { shell.calls.push({ bg, darkIcons }) } })
    return shell
}

//* jsdom 不加载 tokens.css, 计算 --bg 恒空串: 桩一枚固定值以钉 "bg 取自 getComputedStyle(--bg)" 的取数面.
function stubComputedBg(bg: string): void
{
    vi.stubGlobal('getComputedStyle', vi.fn(() => ({ getPropertyValue: (name: string) => (name === '--bg' ? bg : '') })))
}

describe('applyTheme -> AndroidShell.setSystemBar (系统栏上报契约)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
    })
    afterEach(() =>
    {
        vi.unstubAllGlobals()  //* AndroidShell/getComputedStyle 桩用后即还 (缺省 matchMedia 桩由 setup.ts 的 beforeEach 重装).
    })

    it('手动 light/dark 切换: 以计算 --bg 为 bg, darkIcons 与生效亮档绑定 (light=true, dark=false)', () =>
    {
        stubComputedBg('#f4f6f3')
        const shell = stubAndroidShell()
        applyTheme('sage', 'light')
        expect(shell.calls).toEqual([{ bg: '#f4f6f3', darkIcons: true }])
        applyTheme('dusk', 'dark')
        expect(shell.calls).toEqual([
            { bg: '#f4f6f3', darkIcons: true },
            { bg: '#f4f6f3', darkIcons: false },
        ])
    })

    it('"跟随系统"经 matchMedia 变化路径重新上报 (main.tsx 订阅接线同参组合): OS 翻转即再调 setSystemBar 且 darkIcons 反转', () =>
    {
        stubComputedBg('#22252a')
        const shell = stubAndroidShell()
        const stub = installMatchMediaStub(false)
        localStorage.setItem(MODE_STORAGE_KEY, 'system')
        //* 与 main.tsx 逐字同形的接线: 订阅回调以存储偏好整体重应用 (applyTheme 内含系统栏上报).
        const unsubscribe = subscribeSystemMode(() => applyTheme(getStoredTheme(), getStoredMode()))
        applyTheme(getStoredTheme(), getStoredMode())  //* 冷启动初始上报 (亮档).
        expect(shell.calls).toEqual([{ bg: '#22252a', darkIcons: true }])
        stub.flip(true)  //* OS 翻转 -> 订阅回调重应用 -> 再次上报.
        expect(shell.calls).toEqual([
            { bg: '#22252a', darkIcons: true },
            { bg: '#22252a', darkIcons: false },
        ])
        unsubscribe()
    })

    it('window.AndroidShell 缺席 (纯浏览器 dev 环境): 直接调用与 matchMedia 变化路径均静默不抛', () =>
    {
        stubComputedBg('#ffffff')
        expect(() => applyTheme('dusk', 'dark')).not.toThrow()
        const stub = installMatchMediaStub(false)
        localStorage.setItem(MODE_STORAGE_KEY, 'system')
        const unsubscribe = subscribeSystemMode(() => applyTheme(getStoredTheme(), getStoredMode()))
        expect(() => stub.flip(true)).not.toThrow()
        unsubscribe()
    })
})
//endregion
