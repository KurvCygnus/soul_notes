//* 主题工具测试 (D24): 双主题色板切换的读取三态契约 — 合法值直通, 缺失/非法一律回退默认雾杉;
//* 键名 'soul.theme' 同时被 index.html 内联早脚本消费 (防 FOUC), 两处逻辑必须保持一致.
import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, DEFAULT_THEME, getStoredTheme, THEME_STORAGE_KEY } from './theme'

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

describe('applyTheme (主题应用与持久化)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        document.documentElement.removeAttribute('data-theme')
    })

    it('写 data-theme 到 <html> 并落 localStorage', () =>
    {
        applyTheme('dusk')
        expect(document.documentElement.dataset.theme).toBe('dusk')
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dusk')
    })
})
