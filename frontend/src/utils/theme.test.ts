//* 主题与外观工具测试 (D24 + 外观定稿): 主题读取三态契约 (合法直通, 缺失/非法回退雾杉) 不变;
//* 外观模式三态同构 (合法直通, 缺失/非法回退 system), system 档经 matchMedia 解析为具体档位上 DOM 而存储仍存 system,
//* 订阅契约: 注册 change 监听随 OS 翻转回调 light/dark, 退订即静默 — matchMedia 桩见 [[installMatchMediaStub]].
//* 键名 'soul.theme'/'soul.mode' 同时被 index.html 内联早脚本消费 (防 FOUC), 两处逻辑必须保持一致.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    applyTheme,
    DEFAULT_MODE,
    DEFAULT_THEME,
    getStoredMode,
    getStoredTheme,
    MODE_STORAGE_KEY,
    resolveEffectiveMode,
    subscribeSystemMode,
    THEME_STORAGE_KEY,
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
