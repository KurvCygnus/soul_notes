//* 设置页测试: 主题/外观双分段控件只经 theme 模块切换 — 即时上 <html data-theme/data-mode> 并持久化,
//* 挂载即对齐存储值 (深链兜底); 页面定稿后不得再有"更多设置 建设中"占位.
//* matchMedia 桩逐用例自装可控实例 (setup 的 beforeEach 也装恒亮桩, 用例内再装后装先赢), 需要翻转语义时 flip.
//* Task 3 增补: 对话风格分区 (chatStyle API 整体 vi.mock, 不触网络, 只验 UI 契约: 回显/乐观/回滚/toast);
//* Task 4 增补: 显示分区字号步进器 (纯 localStorage 管线, 断言 soul.chatFont 持久化与 --fs-chat 内联令牌).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsView from './SettingsView'
import { installMatchMediaStub } from '../test/matchMedia'
import type { MatchMediaStub } from '../test/matchMedia'
import { MODE_STORAGE_KEY, THEME_STORAGE_KEY } from '../utils/theme'
import { getChatStyle, putChatStyle } from '../api/chatStyle'
import { toast } from '../utils/toast'
import { CHAT_FONT_STORAGE_KEY } from '../utils/chatFont'
import type { ChatStyleVo } from '../types'

vi.mock('../api/chatStyle', () => ({ getChatStyle: vi.fn(), putChatStyle: vi.fn() }))
vi.mock('../utils/toast', () =>
{
    //* ToastHost 一并补空实现: 模块整体替换后同模块其它导出不得缺席.
    return { toast: vi.fn(), ToastHost: () => null }
})

//* 下方两个既有 describe 的挂载同样会触发对话风格 GET effect: 模块级先给默认成功壳
//* (null = 静默保持全默认, 不 toast 不崩), 新 describe 的 beforeEach 再逐用例覆写.
vi.mocked(getChatStyle).mockResolvedValue(null)
vi.mocked(putChatStyle).mockResolvedValue({ style: 'default', warmth: 'default', enthusiasm: 'default', headings: 'default', emoji: 'default' })

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

//* 全默认五轴 (对话风格用例的公共锚点与 PUT 失败回滚的目标态).
const ALL_DEFAULT: ChatStyleVo = { style: 'default', warmth: 'default', enthusiasm: 'default', headings: 'default', emoji: 'default' }

describe('SettingsView 对话风格 (Task 3)', () =>
{
    //* matchMedia 无需自装可控桩: 本组不翻转明暗语义, setup.ts 的 beforeEach 恒亮桩已覆盖挂载链.

    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()
        vi.mocked(getChatStyle).mockResolvedValue(null)
        vi.mocked(putChatStyle).mockResolvedValue(ALL_DEFAULT)
    })

    afterEach(() =>
    {
        cleanup()
    })

    it('五轴渲染: 7 选 1 基础风格 + 四轴三态分段全在场, 默认档选中, 免责说明在场', () =>
    {
        render(<SettingsView />)
        const styleGroup = screen.getByRole('group', { name: '基础风格选择' })
        for(const label of ['默认', '专业可靠', '亲和友善', '直率乐观', '天马行空', '高效务实', '吐槽达人'])
            expect(within(styleGroup).getByRole('button', { name: label })).toBeInTheDocument()
        expect(within(styleGroup).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true')
        for(const axis of ['亲切程度', '热情程度', '标题和列表', '表情符号'])
            expect(within(screen.getByRole('group', { name: axis })).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('仅影响倾听者回复的措辞与格式, 安全守护不受影响.')).toBeInTheDocument()
    })

    it('GET 回显: 挂载拉取服务端偏好并点亮对应档位 (不触发 PUT)', async () =>
    {
        vi.mocked(getChatStyle).mockResolvedValue({ style: 'witty', warmth: 'more', enthusiasm: 'less', headings: 'default', emoji: 'more' })
        render(<SettingsView />)
        const styleGroup = screen.getByRole('group', { name: '基础风格选择' })
        await waitFor(() => expect(within(styleGroup).getByRole('button', { name: '吐槽达人' })).toHaveAttribute('aria-pressed', 'true'))
        expect(within(screen.getByRole('group', { name: '亲切程度' })).getByRole('button', { name: '增强' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByRole('group', { name: '热情程度' })).getByRole('button', { name: '减弱' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByRole('group', { name: '标题和列表' })).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByRole('group', { name: '表情符号' })).getByRole('button', { name: '增强' })).toHaveAttribute('aria-pressed', 'true')
        expect(putChatStyle).not.toHaveBeenCalled()  //* 回显是读路径, 不得顺手写回.
    })

    it('GET 失败: toast 提示且保持全默认回显 (设置页不因网络白屏)', async () =>
    {
        vi.mocked(getChatStyle).mockRejectedValue(new Error('offline'))
        render(<SettingsView />)
        await waitFor(() => expect(toast).toHaveBeenCalledWith('风格设置加载失败', 'error'))
        expect(within(screen.getByRole('group', { name: '基础风格选择' })).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByRole('group', { name: '表情符号' })).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('点选风格: 乐观即时翻转 aria-pressed, 并 PUT 全量五轴 (未动轴保持当前值)', async () =>
    {
        const user = userEvent.setup()
        render(<SettingsView />)
        const styleGroup = screen.getByRole('group', { name: '基础风格选择' })
        await user.click(within(styleGroup).getByRole('button', { name: '亲和友善' }))
        expect(within(styleGroup).getByRole('button', { name: '亲和友善' })).toHaveAttribute('aria-pressed', 'true')  //* 乐观先亮, 不等响应.
        expect(within(styleGroup).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'false')
        expect(putChatStyle).toHaveBeenCalledWith({ style: 'friendly', warmth: 'default', enthusiasm: 'default', headings: 'default', emoji: 'default' })
    })

    it('点选轴档: PUT 体携带该轴新档与其余轴当前值 (GET 回显态为基)', async () =>
    {
        vi.mocked(getChatStyle).mockResolvedValue({ style: 'pragmatic', warmth: 'less', enthusiasm: 'default', headings: 'default', emoji: 'more' })
        const user = userEvent.setup()
        render(<SettingsView />)
        const warmthGroup = screen.getByRole('group', { name: '亲切程度' })
        await waitFor(() => expect(within(warmthGroup).getByRole('button', { name: '减弱' })).toHaveAttribute('aria-pressed', 'true'))
        await user.click(within(warmthGroup).getByRole('button', { name: '增强' }))
        expect(putChatStyle).toHaveBeenCalledWith({ style: 'pragmatic', warmth: 'more', enthusiasm: 'default', headings: 'default', emoji: 'more' })
    })

    it('PUT 失败: toast 提示并回滚到失败前档位', async () =>
    {
        vi.mocked(putChatStyle).mockRejectedValue(new Error('offline'))
        const user = userEvent.setup()
        render(<SettingsView />)
        const styleGroup = screen.getByRole('group', { name: '基础风格选择' })
        //* user.click 内部冲刷微任务, 立即拒绝的保存会在 click 返回前就完成回滚 —
        //* "乐观先亮"已在成功用例验证, 本用例只锁定终态: toast + 回滚到失败前的默认档.
        await user.click(within(styleGroup).getByRole('button', { name: '直率乐观' }))
        expect(toast).toHaveBeenCalledWith('保存失败, 请重试', 'error')
        expect(within(styleGroup).getByRole('button', { name: '直率乐观' })).toHaveAttribute('aria-pressed', 'false')
        expect(within(styleGroup).getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true')
    })
})

describe('SettingsView 显示-字体大小 (Task 4)', () =>
{
    //* matchMedia 无需自装可控桩: 本组不翻转明暗语义, setup.ts 的 beforeEach 恒亮桩已覆盖挂载链.

    beforeEach(() =>
    {
        localStorage.clear()
        //* 步进器会把令牌写上 <html> 内联 style, 逐用例复位防跨用例串扰 (跨文件隔离由 runner 保证).
        document.documentElement.style.removeProperty('--fs-chat')
        vi.mocked(getChatStyle).mockResolvedValue(null)
        vi.mocked(putChatStyle).mockResolvedValue(ALL_DEFAULT)
    })

    afterEach(() =>
    {
        cleanup()
        document.documentElement.style.removeProperty('--fs-chat')
    })

    it('默认 15px: 无存储时回显默认档, 两向可点, 挂载即落内联令牌并持久化', () =>
    {
        render(<SettingsView />)
        expect(screen.getByRole('group', { name: '字体大小' })).toBeInTheDocument()
        expect(screen.getByText('15px')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '减小字体' })).toBeEnabled()
        expect(screen.getByRole('button', { name: '增大字体' })).toBeEnabled()
        expect(document.documentElement.style.getPropertyValue('--fs-chat')).toBe('15px')
        expect(localStorage.getItem(CHAT_FONT_STORAGE_KEY)).toBe('15')  //* 挂载对齐走同一条应用管线, 双写幂等.
    })

    it('步进: 点 + 变 16px, 写 soul.chatFont 并更新 --fs-chat 内联令牌', async () =>
    {
        const user = userEvent.setup()
        render(<SettingsView />)
        await user.click(screen.getByRole('button', { name: '增大字体' }))
        expect(screen.getByText('16px')).toBeInTheDocument()
        expect(localStorage.getItem(CHAT_FONT_STORAGE_KEY)).toBe('16')
        expect(document.documentElement.style.getPropertyValue('--fs-chat')).toBe('16px')
        await user.click(screen.getByRole('button', { name: '减小字体' }))
        expect(screen.getByText('15px')).toBeInTheDocument()
        expect(localStorage.getItem(CHAT_FONT_STORAGE_KEY)).toBe('15')
    })

    it('clamp 上界: 预置 20 时 + 禁用, − 可回退 19 并持久化', async () =>
    {
        localStorage.setItem(CHAT_FONT_STORAGE_KEY, '20')
        const user = userEvent.setup()
        render(<SettingsView />)
        const plus = screen.getByRole('button', { name: '增大字体' })
        const minus = screen.getByRole('button', { name: '减小字体' })
        expect(screen.getByText('20px')).toBeInTheDocument()
        expect(plus).toBeDisabled()
        expect(minus).toBeEnabled()
        await user.click(minus)
        expect(screen.getByText('19px')).toBeInTheDocument()
        expect(localStorage.getItem(CHAT_FONT_STORAGE_KEY)).toBe('19')
        expect(plus).toBeEnabled()  //* 离开边界即解禁.
    })

    it('clamp 下界: 预置 12 时 − 禁用, + 可进到 13 并持久化', async () =>
    {
        localStorage.setItem(CHAT_FONT_STORAGE_KEY, '12')
        const user = userEvent.setup()
        render(<SettingsView />)
        const plus = screen.getByRole('button', { name: '增大字体' })
        const minus = screen.getByRole('button', { name: '减小字体' })
        expect(screen.getByText('12px')).toBeInTheDocument()
        expect(minus).toBeDisabled()
        expect(plus).toBeEnabled()
        await user.click(plus)
        expect(screen.getByText('13px')).toBeInTheDocument()
        expect(localStorage.getItem(CHAT_FONT_STORAGE_KEY)).toBe('13')
        expect(minus).toBeEnabled()  //* 离开边界即解禁.
    })

    it('坏存储回退: 非数值回落默认 15, 越界值夹取到值域边界', () =>
    {
        localStorage.setItem(CHAT_FONT_STORAGE_KEY, 'abc')
        const { unmount } = render(<SettingsView />)
        expect(screen.getByText('15px')).toBeInTheDocument()
        unmount()
        localStorage.setItem(CHAT_FONT_STORAGE_KEY, '99')
        render(<SettingsView />)
        expect(screen.getByText('20px')).toBeInTheDocument()
    })

    it('重挂载恢复: 预置 18 挂载即回显并落 --fs-chat 内联令牌 (启动恢复语义)', () =>
    {
        localStorage.setItem(CHAT_FONT_STORAGE_KEY, '18')
        render(<SettingsView />)
        expect(screen.getByText('18px')).toBeInTheDocument()
        expect(document.documentElement.style.getPropertyValue('--fs-chat')).toBe('18px')
    })
})
