//* Mock 扩展测试: 注册契约 (mock 标注 + 总览在场/缺席) 与页面取数上屏 (数据经 Ext* 原语渲染).
//* api 模块整体 mock, 不发真实 fetch; mock 数据内联在 vi.mock 工厂里 (工厂被提升, 引不到外层常量).
//* 页面经 JSX 渲染而非 ext.page({...}) 直接函数调用 — 直接调用会让 hooks 落在渲染器外触发 Invalid hook call.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { mockExtensions } from './index'
import { getContextSummary } from '../../api/context'
import type { IExtensionPoint } from '../types'

vi.mock('../../api/context', () => ({ getContextSummary: vi.fn().mockResolvedValue({
    schedule: [{ course: '数据结构', timeRange: '08:00-09:40', location: '二教 105' }],
    exams: [{ name: '高等数学期中考', date: '2026-10-06', daysUntil: 6, location: '一教 302' }],
    agenda: [],
}) }))

function renderPage(ext: IExtensionPoint | undefined): void
{
    if(ext == null)
        throw new Error('扩展未注册')
    const Page = ext.page
    render(<Page query={{ context: getContextSummary }} />)
}

function renderOverview(ext: IExtensionPoint | undefined): void
{
    if(ext?.overview == null)
        throw new Error('扩展未提供总览')
    const Overview = ext.overview
    render(<Overview />)
}

describe('mock-timetable (课表 Mock 扩展)', () =>
{
    const timetable = mockExtensions.find(e => e.id === 'mock-timetable')
    const agenda = mockExtensions.find(e => e.id === 'mock-agenda')

    it('注册项带 mock 标注且提供总览 (总览由课表 Mock 独占注册)', () =>
    {
        expect(timetable?.mock).toBe(true)
        expect(timetable?.overview).toBeTruthy()
    })
    it('日程 Mock 同样带 mock 标注且仅注册页面', () =>
    {
        expect(agenda?.mock).toBe(true)
        expect(agenda?.page).toBeTruthy()
        expect(agenda?.overview).toBeUndefined()  //* 总览槽位单提供者: 不与课表 Mock 竞争 (D9 首注册语义).
    })
    it('页面渲染课表行 (查询数据上屏)', async () =>
    {
        renderPage(timetable)
        expect(await screen.findByText('08:00-09:40')).toBeInTheDocument()
        expect(screen.getByText(/数据结构/)).toBeInTheDocument()  //* 课程与地点合并为单文本节点, 用正则局部匹配.
        expect(screen.queryByText('加载中')).not.toBeInTheDocument()  //* 数据落定后加载态退场.
    })
    it('页面头部带 Mock 标注 (ExtBadge)', async () =>
    {
        renderPage(timetable)
        expect(await screen.findByText('Mock')).toBeInTheDocument()
        expect(screen.getByText('课表')).toBeInTheDocument()
    })
    it('总览渲染三张聚合卡 (课表摘要/近期日程/近期考试, 数据同源 query.context)', async () =>
    {
        renderOverview(timetable)
        expect(await screen.findByText('今日课表摘要')).toBeInTheDocument()
        expect(screen.getByText('近期日程')).toBeInTheDocument()
        expect(screen.getByText('近期考试')).toBeInTheDocument()
        expect(screen.getByText(/数据结构/)).toBeInTheDocument()
        expect(screen.getByText(/高等数学期中考/)).toBeInTheDocument()
    })
    it('日程页同构简化: 空数据走 ExtEmpty 而非报错', async () =>
    {
        renderPage(agenda)
        expect(await screen.findByText(/暂无近期安排/)).toBeInTheDocument()
    })
})
