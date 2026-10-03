//* 登录浮层冒烟: 协议门禁 (未勾禁提交), 登录/注册端点分流, 非 STUDENT 拒入 (toast + 登出 + 不回调).
//* API 层整体 vi.mock (不 mock fetch): 用例只验 UI 契约, 不触网络与真实 localStorage 落盘.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { login, logout, register } from '../../api/auth'
import { toast } from '../../utils/toast'
import LoginSheet from './LoginSheet'
import type { AuthData } from '../../types'

vi.mock('../../api/auth', () =>
{
    return { login: vi.fn(), register: vi.fn(), logout: vi.fn() }
})
vi.mock('../../utils/toast', () =>
{
    //* ToastHost 一并补空实现: 模块整体替换后同模块其它导出不得缺席.
    return { toast: vi.fn(), ToastHost: () => null }
})

const STUDENT: AuthData = { token: 't1', userId: 'u1', username: 'stu', role: 'STUDENT' }
const COUNSELOR: AuthData = { token: 't2', userId: 'u2', username: 'cns', role: 'COUNSELOR' }

//* 填满用户名/密码并勾选协议: 走通门禁三步.
async function fillAndAgree(user: UserEvent): Promise<void>
{
    await user.type(screen.getByLabelText('用户名'), 'stu')
    await user.type(screen.getByLabelText('密码'), 'pw123456')
    await user.click(screen.getByLabelText('我已完整阅读并同意'))
}

describe('LoginSheet (登录浮层)', () =>
{
    beforeEach(() => vi.clearAllMocks())

    it('未勾协议: 填满账号密码提交仍禁用; 勾选解禁; 协议链接浮层内展开且不关浮层', async () =>
    {
        const user = userEvent.setup()
        render(<LoginSheet open onAuthed={vi.fn()} onCancel={vi.fn()} />)
        await user.type(screen.getByLabelText('用户名'), 'stu')
        await user.type(screen.getByLabelText('密码'), 'pw123456')
        expect(screen.getByRole('button', { name: '登录' })).toBeDisabled()
        //* 协议链接点击后全文出现在浮层内 (滚动区), 表单与浮层本体不消失.
        await user.click(screen.getByRole('link', { name: /AI 服务使用协议与免责声明/ }))
        expect(screen.getByText('七、协议的更新与接受')).toBeInTheDocument()
        expect(screen.getByLabelText('用户名')).toBeInTheDocument()
        await user.click(screen.getByLabelText('我已完整阅读并同意'))
        expect(screen.getByRole('button', { name: '登录' })).toBeEnabled()
    })

    it('登录成功: onAuthed 收到 AuthData, 不触发登出', async () =>
    {
        vi.mocked(login).mockResolvedValue(STUDENT)
        const onAuthed = vi.fn()
        const user = userEvent.setup()
        render(<LoginSheet open onAuthed={onAuthed} onCancel={vi.fn()} />)
        await fillAndAgree(user)
        await user.click(screen.getByRole('button', { name: '登录' }))
        expect(login).toHaveBeenCalledWith('stu', 'pw123456')
        expect(onAuthed).toHaveBeenCalledWith(STUDENT)
        expect(logout).not.toHaveBeenCalled()
    })

    it('切换注册: 提交走 register 端点并回调', async () =>
    {
        vi.mocked(register).mockResolvedValue(STUDENT)
        const onAuthed = vi.fn()
        const user = userEvent.setup()
        render(<LoginSheet open onAuthed={onAuthed} onCancel={vi.fn()} />)
        await user.click(screen.getByRole('button', { name: '切换注册' }))
        await fillAndAgree(user)
        await user.click(screen.getByRole('button', { name: '注册' }))
        expect(register).toHaveBeenCalledWith('stu', 'pw123456')
        expect(login).not.toHaveBeenCalled()
        expect(onAuthed).toHaveBeenCalledWith(STUDENT)
    })

    it('非 STUDENT 角色: toast 提示 + 登出清理凭证, 不回调, 浮层保持打开', async () =>
    {
        vi.mocked(login).mockResolvedValue(COUNSELOR)
        const onAuthed = vi.fn()
        const user = userEvent.setup()
        render(<LoginSheet open onAuthed={onAuthed} onCancel={vi.fn()} />)
        await fillAndAgree(user)
        await user.click(screen.getByRole('button', { name: '登录' }))
        expect(toast).toHaveBeenCalledWith('请使用咨询员工作台', 'error')
        expect(logout).toHaveBeenCalledOnce()
        expect(onAuthed).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
    })

    it('dialog 语义完整: Escape 键触发 onCancel 关闭浮层', async () =>
    {
        const onCancel = vi.fn()
        const user = userEvent.setup()
        render(<LoginSheet open onAuthed={vi.fn()} onCancel={onCancel} />)
        //* 复审修复: 浮层必须是语义对话框 (读屏器可识别模态), Escape 是键盘用户的关闭通道.
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
        await user.keyboard('{Escape}')
        expect(onCancel).toHaveBeenCalledOnce()
    })
})
