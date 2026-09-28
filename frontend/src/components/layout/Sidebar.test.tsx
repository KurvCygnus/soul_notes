//* 左栏测试: 折叠切换 (宽度/aria/偏好持久化), 访客态 (登录钮 + 无会话区), 删除破坏性操作的 confirm 门控.
//* 纯 props 驱动设计: 约定 shell 仅对访客传 onOpenLogin, 故用例以该 prop 表达登录态, 不需要 AuthProvider.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import Sidebar, { SIDEBAR_PREF_KEY } from './Sidebar'
import type { ISidebarProps } from './Sidebar'
import type { ChatSessionVo } from '../../types'

const SESSIONS: ChatSessionVo[] = [
    { sessionId: 's1', messageCount: 2, lastUpdateTime: '2026-09-28T10:00:00', preview: '最近的考试压力' },
    { sessionId: 's2', messageCount: 5, lastUpdateTime: '2026-09-27T09:00:00', preview: '室友关系烦恼' },
]

function renderSidebar(props: ISidebarProps): ReactElement
{
    return <MemoryRouter><Sidebar {...props} /></MemoryRouter>
}

describe('Sidebar (应用左栏)', () =>
{
    beforeEach(() => localStorage.clear())
    afterEach(() => vi.restoreAllMocks())

    it('折叠切换: 宽度 260<->48, aria-expanded 翻转, 偏好写入 localStorage', async () =>
    {
        const user = userEvent.setup()
        const onToggle = vi.fn()
        const { rerender } = render(renderSidebar({ collapsed: false, onToggle }))
        const rail = screen.getByRole('complementary')
        expect(rail).toHaveStyle({ width: '260px' })
        expect(screen.getByRole('button', { name: '收起侧栏' })).toHaveAttribute('aria-expanded', 'true')
        await user.click(screen.getByRole('button', { name: '收起侧栏' }))
        expect(onToggle).toHaveBeenCalledOnce()
        expect(localStorage.getItem(SIDEBAR_PREF_KEY)).toBe('collapsed')
        //* 壳翻转 collapsed 后重渲染: 图标条形态生效, 按钮语义同步换向.
        rerender(renderSidebar({ collapsed: true, onToggle }))
        expect(rail).toHaveStyle({ width: '48px' })
        expect(screen.getByRole('button', { name: '展开侧栏' })).toHaveAttribute('aria-expanded', 'false')
        await user.click(screen.getByRole('button', { name: '展开侧栏' }))
        expect(localStorage.getItem(SIDEBAR_PREF_KEY)).toBe('expanded')
    })

    it('访客态: 显示登录钮且点击回调, 不渲染会话区与情境区', async () =>
    {
        const user = userEvent.setup()
        const onOpenLogin = vi.fn()
        render(renderSidebar({ collapsed: false, onToggle: vi.fn(), onOpenLogin }))
        expect(screen.queryByText('会话')).not.toBeInTheDocument()
        expect(screen.queryByText('你的情境')).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '登录 / 注册' }))
        expect(onOpenLogin).toHaveBeenCalledOnce()
    })

    it('删除会话: 先经 window.confirm 门控, 拒绝不删, 确认才回调 sessionId', async () =>
    {
        const user = userEvent.setup()
        const onDeleteSession = vi.fn()
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(renderSidebar({ collapsed: false, onToggle: vi.fn(), sessions: SESSIONS, onDeleteSession }))
        await user.click(screen.getByRole('button', { name: '删除会话: 最近的考试压力' }))
        expect(confirmSpy).toHaveBeenCalledOnce()
        expect(onDeleteSession).not.toHaveBeenCalled()
        confirmSpy.mockReturnValue(true)
        await user.click(screen.getByRole('button', { name: '删除会话: 最近的考试压力' }))
        expect(onDeleteSession).toHaveBeenCalledWith('s1')
    })

    it('登录态: 渲染会话区与情境区且无登录钮 (与访客态互斥)', () =>
    {
        render(renderSidebar({ collapsed: false, onToggle: vi.fn(), sessions: SESSIONS }))
        expect(screen.getByText('会话')).toBeInTheDocument()
        expect(screen.getByText('你的情境')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '登录 / 注册' })).not.toBeInTheDocument()
    })
})
