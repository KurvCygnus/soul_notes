//* 应用壳冒烟: 问候占位渲染 + 危机支持入口对未登录访客可见 (公开路由红线).
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () =>
{
    it('renders without crashing', () =>
    {
        render(<App />)
        expect(screen.getByRole('heading', { name: '你好, 今天想聊点什么?' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: '消息输入框' })).toBeInTheDocument()  //* Task 11: 输入区就位 (原 composer-slot 占位已替换).
        expect(screen.getByRole('link', { name: '危机支持' })).toHaveAttribute('href', '/crisis')
    })
})
