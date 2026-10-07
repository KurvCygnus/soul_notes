//* 访客门状态机测试: 契约 (Composer/ChatView 依赖) = 门只拦访客, confirm 补发, cancel 丢弃.
//* 依设计裁决: [[useChatGate]] 活在 AuthContext 内, 全部用例渲染于 <AuthProvider> 下 (默认未登录).
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { api, ApiError, setUnauthorizedHandler } from '../api/http'
import { useAuth } from './useAuth'
import { useChatGate } from './useChatGate'
import type { AuthData } from '../types'

const AUTHED: AuthData = { token: 't', userId: 'u', username: 'n', role: 'STUDENT' }

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

//* 冲刷 401 级联 (登出请求 -> 再广播 -> 护栏短路) 的微任务链: 链路很短, 固定轮数足够.
async function flushCascade(): Promise<void>
{
    for(let i = 0; i < 10; i++)
        await Promise.resolve()
}

describe('useChatGate (访客门状态机)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        //* 兜底隔离上一用例可能残留的全局回调 (用例内部自证卸载清理, 此处不掩盖行为).
        setUnauthorizedHandler(null)
    })
    afterEach(() => vi.unstubAllGlobals())

    it('访客 requireAuth: 开浮层存 pending, 不执行', () =>
    {
        const { result } = renderHook(() => useChatGate(), { wrapper })
        const action = vi.fn()
        act(() => result.current.requireAuth(action))
        expect(result.current.open).toBe(true)
        expect(result.current.pending).toBe(action)
        expect(action).not.toHaveBeenCalled()
    })

    it('confirm: 登录成功后 pending 自动补发一次并关门 (补发时令牌已落盘)', () =>
    {
        const { result } = renderHook(() => useChatGate(), { wrapper })
        let tokenAtRun: string | null = 'UNSET'
        const action = vi.fn(() => { tokenAtRun = localStorage.getItem('soul.token') })
        act(() => result.current.requireAuth(action))
        act(() => result.current.confirm(AUTHED))
        expect(action).toHaveBeenCalledOnce()
        expect(result.current.open).toBe(false)
        expect(result.current.pending).toBeNull()
        //* 补发必须发生在 login 落盘之后, 否则 pending 内的发送请求带不上新 JWT.
        expect(tokenAtRun).toBe('t')
    })

    it('cancel: 丢弃 pending, 原 action 此后永不执行', () =>
    {
        const { result } = renderHook(() => useChatGate(), { wrapper })
        const action = vi.fn()
        act(() => result.current.requireAuth(action))
        act(() => result.current.cancel())
        expect(result.current.open).toBe(false)
        expect(result.current.pending).toBeNull()
        //* 即便之后发生无关 confirm, 被丢弃的动作也不会借尸还魂.
        act(() => result.current.confirm(AUTHED))
        expect(action).not.toHaveBeenCalled()
        expect(result.current.open).toBe(false)
    })

    it('已登录 requireAuth: 立即执行且浮层不出现 (登录用户永不进门)', () =>
    {
        const { result } = renderHook(() => ({ auth: useAuth(), gate: useChatGate() }), { wrapper })
        act(() => result.current.auth.login(AUTHED))
        const action = vi.fn()
        act(() => result.current.gate.requireAuth(action))
        expect(action).toHaveBeenCalledOnce()
        expect(result.current.gate.open).toBe(false)
        expect(result.current.gate.pending).toBeNull()
    })

    it('AuthProvider 挂载时从 localStorage 水合登录态', () =>
    {
        localStorage.setItem('soul.token', AUTHED.token)
        localStorage.setItem('soul.auth', JSON.stringify(AUTHED))
        const { result } = renderHook(() => useAuth(), { wrapper })
        expect(result.current.user).toEqual(AUTHED)
    })

    it('401 广播: 任一请求会话失效即自动登出并清双键', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
        const { result } = renderHook(() => useAuth(), { wrapper })
        act(() => result.current.login(AUTHED))
        expect(localStorage.getItem('soul.token')).toBe('t')
        await act(async () =>
        {
            await expect(api('/api/v1/chat/sessions')).rejects.toBeInstanceOf(ApiError)
            await flushCascade()
        })
        expect(result.current.user).toBeNull()
        expect(localStorage.getItem('soul.token')).toBeNull()
        expect(localStorage.getItem('soul.auth')).toBeNull()
    })

    it('401 级联幂等: 登出请求自身的 401 不再触发重复登出', async () =>
    {
        const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
            .mockResolvedValue(new Response('{}', { status: 401 }))
        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useAuth(), { wrapper })
        act(() => result.current.login(AUTHED))
        await act(async () =>
        {
            await expect(api('/a')).rejects.toBeInstanceOf(ApiError)
            await expect(api('/b')).rejects.toBeInstanceOf(ApiError)
            await flushCascade()
        })
        const logoutCalls = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/v1/auth/logout')
        expect(logoutCalls).toHaveLength(1)
    })

    it('卸载 AuthProvider 后注销 401 广播, 不再产生登出副作用', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
        const { result, unmount } = renderHook(() => useAuth(), { wrapper })
        act(() => result.current.login(AUTHED))
        unmount()
        localStorage.setItem('soul.token', 'stale')//* 模拟登出竞争窗口内的残留令牌
        await act(async () =>
        {
            await expect(api('/x')).rejects.toBeInstanceOf(ApiError)
            await flushCascade()
        })
        //* 回调已注销: 未挂载期间 401 不得清键 (否则泄漏的闭包仍在改写全局存储).
        expect(localStorage.getItem('soul.token')).toBe('stale')
    })

    it('脱离 AuthProvider 使用 useChatGate 直接报错 (门必须活在认证上下文内)', () =>
    {
        expect(() => renderHook(() => useChatGate())).toThrow(/AuthProvider/)
    })
})
