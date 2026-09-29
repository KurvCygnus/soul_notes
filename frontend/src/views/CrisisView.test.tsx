//* 危机页数据注入测试 (产品红线): 首屏即默认兜底号码 (零网络完整可读), 缓存到达后原位刷新,
//* 预约入口卡按 appointmentUrl 判空显隐. getCachedHotline 局部 mock, DEFAULT_HOTLINE 保持真身.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getCachedHotline } from '../api/hotline'
import CrisisView from './CrisisView'
import type { HotlineInfo } from '../types'

vi.mock('../api/hotline', async (importOriginal) =>
{
    return { ...(await importOriginal<typeof import('../api/hotline')>()), getCachedHotline: vi.fn() }
})

const CACHED: HotlineInfo = {
    name: '校园心理中心热线',
    primary: '010-88886666',
    backup: '021-12345678',
    message: '工作日 8:00-22:00',
    appointmentUrl: 'https://counsel.example.com/book',
}

describe('CrisisView (危机支持页)', () =>
{
    beforeEach(() =>
    {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('零网络 (缓存链全灭): 内置默认号码完整可读, 110/120 静态提示保留', async () =>
    {
        vi.mocked(getCachedHotline).mockRejectedValue(new Error('offline'))
        render(<CrisisView />)
        expect(screen.getByRole('link', { name: '400-161-9995' })).toHaveAttribute('href', 'tel:400-161-9995')
        expect(screen.getByRole('link', { name: '12355' })).toHaveAttribute('href', 'tel:12355')
        expect(screen.getByText(/110 或 120/)).toBeInTheDocument()
        expect(screen.queryByRole('region', { name: '预约心理咨询' })).not.toBeInTheDocument()//* 空链接不渲染预约卡
    })

    it('缓存到达: 刷新为 API 数据 (名称/号码/寄语), appointmentUrl 非空渲染预约入口卡', async () =>
    {
        vi.mocked(getCachedHotline).mockResolvedValue(CACHED)
        render(<CrisisView />)
        expect(screen.getByRole('link', { name: '400-161-9995' })).toBeInTheDocument()//* 首绘仍是默认兜底
        expect(await screen.findByRole('link', { name: '010-88886666' })).toHaveAttribute('href', 'tel:010-88886666')
        expect(screen.getByRole('heading', { name: '校园心理中心热线' })).toBeInTheDocument()
        expect(screen.getByText('工作日 8:00-22:00')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: '预约心理咨询' })).
            toContainElement(screen.getByRole('link', { name: '前往预约入口' }))
    })
})
