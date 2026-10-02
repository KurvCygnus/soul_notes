//* 设置页测试 (定稿): 主题/外观双分段控件只经 theme 模块切换 — 即时上 <html data-theme/data-mode> 并持久化,
//* 挂载即对齐存储值 (深链兜底); 页面定稿后不得再有"更多设置 建设中"占位.
//* matchMedia 桩逐用例自装可控实例 (setup 的 beforeEach 也装恒亮桩, 用例内再装后装先赢), 需要翻转语义时 flip.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsView from './SettingsView'
import { installMatchMediaStub } from '../test/matchMedia'
import type { MatchMediaStub } from '../test/matchMedia'
import { MODE_STORAGE_KEY, THEME_STORAGE_KEY } from '../utils/theme'

describe('SettingsView (设置定稿)', () =>
{
    let matchMedia: MatchMediaStub

    beforeEach(() =>
    {
        localStorage.clear()
        matchMedia = installMatchMediaStub(false)
    })

    afterEach(() =>
    {
        cleanup()
    })

    it('定稿形态: 主题/外观两卡在场, 无"更多设置 建设中"占位', () =>
    {
        render(<SettingsView />)
        expect(screen.getByRole('group', { name: '主题选择' })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: '外观选择' })).toBeInTheDocument()
        expect(screen.queryByText('建设中')).not.toBeInTheDocument()
        expect(screen.queryByText('更多设置')).not.toBeInTheDocument()
    })

    it('外观切换: 点深色即上 data-mode=dark 并持久化 soul.mode, aria-pressed 随选翻转', async () =>
    {
        const user = userEvent.setup()
        render(<SettingsView />)
        const group = screen.getByRole('group', { name: '外观选择' })
        const system = within(group).getByRole('button', { name: '跟随系统' })
        const dark = within(group).getByRole('button', { name: '深色' })
        expect(system).toHaveAttribute('aria-pressed', 'true')
        expect(dark).toHaveAttribute('aria-pressed', 'false')

        await user.click(dark)
        expect(document.documentElement.dataset.mode).toBe('dark')
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('dark')
        expect(dark).toHaveAttribute('aria-pressed', 'true')
        expect(system).toHaveAttribute('aria-pressed', 'false')
    })

    it('外观回跟随系统: data-mode 由 matchMedia 当前值解析, 存储存 system 不固化', async () =>
    {
        matchMedia.flip(true)//* 模拟 OS 当前深色: system 应解析为 dark 上 DOM.
        const user = userEvent.setup()
        render(<SettingsView />)
        const group = screen.getByRole('group', { name: '外观选择' })
        await user.click(within(group).getByRole('button', { name: '跟随系统' }))
        expect(document.documentElement.dataset.mode).toBe('dark')
        expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('system')
    })

    it('外观深链: 预置深色偏好时挂载即 data-mode=dark (直接导航不脱节)', () =>
    {
        localStorage.setItem(MODE_STORAGE_KEY, 'dark')
        render(<SettingsView />)
        expect(document.documentElement.dataset.mode).toBe('dark')
    })

    it('主题切换仍工作: 点暮蓝即上 dusk 主题并持久化 soul.theme, 不影响外观档', async () =>
    {
        const user = userEvent.setup()
        render(<SettingsView />)
        const group = screen.getByRole('group', { name: '主题选择' })
        await user.click(within(group).getByRole('button', { name: '暮蓝' }))
        expect(document.documentElement.dataset.theme).toBe('dusk')
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dusk')
        expect(document.documentElement.dataset.mode).toBe('light')//* 恒亮桩下 system 解析为 light, 主题切换不带动外观.
    })
})
