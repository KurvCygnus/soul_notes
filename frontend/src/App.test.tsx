//* 应用壳冒烟: 问候占位渲染 + 访客态头像行 (v2 手风琴侧栏).
//* Task 5: 侧栏危机链接退场 (入口移入 Task 6 汉堡菜单, Flyout 归 Task 8) — 公开路由红线由 /crisis 路由与菜单承接;
//* Task 14: 移动端抽屉开合状态机 (汉堡开 -> 遮罩/Escape 收) — 纯 React 态可在 jsdom 验证,
//* <768px 的呈现归 CSS 媒体查询 (jsdom 不求值也不加载样式表), 测试只断言类名与节点在位性.
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () =>
{
    it('renders without crashing', () =>
    {
        render(<App />)
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: '消息输入框' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '登录 / 注册' })).toBeInTheDocument()  //* 访客态头像行: 壳仅对访客下发 onOpenLogin.
    })

    it('移动端抽屉: 汉堡打开 (类名/遮罩/aria 翻转), 遮罩点击收起, Escape 亦收起', async () =>
    {
        const user = userEvent.setup()
        render(<App />)
        //* 桌面缺省形态: 抽屉关闭, 无遮罩节点 (遮罩仅在 drawerOpen 时渲染).
        expect(document.querySelector('.sidebar.drawer-open')).toBeNull()
        expect(document.querySelector('.drawer-overlay')).toBeNull()
        const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
        expect(hamburger).toHaveAttribute('aria-expanded', 'false')

        await user.click(hamburger)
        expect(document.querySelector('.sidebar.drawer-open')).not.toBeNull()
        const overlay = document.querySelector('.drawer-overlay')
        expect(overlay).not.toBeNull()
        expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveAttribute('aria-expanded', 'true')

        //* 遮罩带 aria-hidden (不在可访问性树), user-event 会拒绝点击, 故走 fireEvent 直接派发;
        //! overlay 的非空断言: 上一行已 expect 在位, expect 不参与 TS 收窄, 只能以 `!` 兑现.
        fireEvent.click(overlay!)
        expect(document.querySelector('.drawer-overlay')).toBeNull()

        //* 重开一次验 Escape 通道 (document 级 keydown 监听仅在开抽屉期间挂载).
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))
        expect(document.querySelector('.drawer-overlay')).not.toBeNull()
        await user.keyboard('{Escape}')
        expect(document.querySelector('.drawer-overlay')).toBeNull()
        expect(screen.getByRole('button', { name: '打开导航菜单' })).toHaveAttribute('aria-expanded', 'false')

        //* 汉堡可访问名随态换向 (打开/关闭), 激活必须是真切换: 开着时再点一次"关闭导航菜单"要能关 — 名实一致.
        await user.click(screen.getByRole('button', { name: '打开导航菜单' }))
        expect(document.querySelector('.drawer-overlay')).not.toBeNull()
        await user.click(screen.getByRole('button', { name: '关闭导航菜单' }))
        expect(document.querySelector('.drawer-overlay')).toBeNull()
        expect(document.querySelector('.sidebar.drawer-open')).toBeNull()
        expect(screen.getByRole('button', { name: '打开导航菜单' })).toHaveAttribute('aria-expanded', 'false')
    })
})
