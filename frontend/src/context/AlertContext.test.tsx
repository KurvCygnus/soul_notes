//* RED 预警上下文测试: WS 通道生命周期随登录态 (访客零连接/登录建连/登出断开/换号重连) + showRed/dismissRed 状态机.
//* connectAlertSocket 整体 mock (不真开 WebSocket): 断言建连参数与关闭函数的调用时机, 不测 WS 内部时序 (ws.test.ts 已覆盖).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { AuthProvider } from './AuthContext'
import { AlertProvider } from './AlertContext'
import { useAlert } from '../hooks/useAlert'
import { useAuth } from '../hooks/useAuth'
import { connectAlertSocket } from '../api/ws'

vi.mock('../api/ws', () => ({ connectAlertSocket: vi.fn() }))

const USER_A = { token: 'ta', userId: 'ua', username: 'a', role: 'STUDENT' } as const
const USER_B = { token: 'tb', userId: 'ub', username: 'b', role: 'STUDENT' } as const

function Harness(): ReactElement
{
    const { user, login, logout } = useAuth()
    const { red, showRed, dismissRed } = useAlert()
    return (
        <div>
            <span data-testid="state">{user == null ? 'guest' : 'authed'}/{red?.reason ?? 'none'}</span>
            <button type="button" onClick={() => login(USER_A)}>login-a</button>
            <button type="button" onClick={() => login(USER_B)}>login-b</button>
            <button type="button" onClick={logout}>logout</button>
            <button type="button" onClick={() => showRed({ type: 'RED_ALERT', reason: '人工注入' })}>show</button>
            <button type="button" onClick={dismissRed}>dismiss</button>
        </div>
    )
}

function renderHarness(): void
{
    render(<AuthProvider><AlertProvider><Harness /></AlertProvider></AuthProvider>)
}

describe('AlertProvider (RED 预警通道生命周期)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('访客零连接: 未登录绝不建立 WS 预警通道', () =>
    {
        renderHarness()
        expect(connectAlertSocket).not.toHaveBeenCalled()
    })

    it('登录建连/登出断开: 以登录令牌建连, 登出调用关闭函数', async () =>
    {
        const closeA = vi.fn()
        vi.mocked(connectAlertSocket).mockReturnValue(closeA)
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login-a' }))
        expect(connectAlertSocket).toHaveBeenCalledOnce()
        expect(connectAlertSocket).toHaveBeenCalledWith('ta', expect.any(Function))
        await u.click(screen.getByRole('button', { name: 'logout' }))
        expect(closeA).toHaveBeenCalledOnce()
    })

    it('换号重连: 旧连接先断开, 新令牌再建连 (logout→login 与直接换登两种迁移)', async () =>
    {
        const closes = [vi.fn(), vi.fn(), vi.fn()]
        let call = 0
        vi.mocked(connectAlertSocket).mockImplementation(() => closes[call++] ?? vi.fn())
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login-a' }))
        await u.click(screen.getByRole('button', { name: 'logout' }))
        await u.click(screen.getByRole('button', { name: 'login-b' }))
        expect(closes[0]).toHaveBeenCalledOnce()//* 登出断开 A
        expect(connectAlertSocket).toHaveBeenLastCalledWith('tb', expect.any(Function))
        expect(connectAlertSocket).toHaveBeenCalledTimes(2)
        //* 直接换登 (不点 logout): user 引用变化同样触发 cleanup 断旧 + 建新.
        await u.click(screen.getByRole('button', { name: 'login-a' }))
        await u.click(screen.getByRole('button', { name: 'login-b' }))
        expect(connectAlertSocket).toHaveBeenCalledTimes(4)//* A/B/A/B 四次建连, 每次换登旧连均被 cleanup 断开
        expect(closes[0]).toHaveBeenCalledOnce()
        expect(closes[1]).toHaveBeenCalledOnce()//* B→A 换登断开 B
        expect(closes[2]).toHaveBeenCalledOnce()//* A→B 换登断开 A
    })

    it('showRed/dismissRed: WS onRed 回调与人工注入都改写 red 态; 连发两次以最新一条渲染; dismiss 归零', async () =>
    {
        const u = userEvent.setup()
        renderHarness()
        await u.click(screen.getByRole('button', { name: 'login-a' }))
        const onRed = vi.mocked(connectAlertSocket).mock.calls[0]?.[1]
        expect(onRed).toBeInstanceOf(Function)
        act(() => onRed?.({ type: 'RED_ALERT', reason: 'WS 推送' }))
        expect(screen.getByTestId('state')).toHaveTextContent('authed/WS 推送')
        //* 连发两条: 后者整体替换前者, 弹窗 (消费 red 的组件) 必须以最新消息重渲染.
        await u.click(screen.getByRole('button', { name: 'show' }))
        await u.click(screen.getByRole('button', { name: 'show' }))
        expect(screen.getByTestId('state')).toHaveTextContent('authed/人工注入')
        await u.click(screen.getByRole('button', { name: 'dismiss' }))
        expect(screen.getByTestId('state')).toHaveTextContent('authed/none')
    })
})
