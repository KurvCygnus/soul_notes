//* 校园扩展页测试 (P3 去 mock 转正): 页面取数上屏 / 无 Mock 徽标 / 考试独立详情页 / 课表页挂通知开关.
//* api/ext 模块整体 mock, 不发真实 fetch; 桩按扩展名分发 (timetable/exams/agenda 各回各形, 总览三路并联同享此桩);
//* mock 数据内联在 vi.mock 工厂里 (工厂被提升, 引不到外层常量).
//* 页面经 JSX 渲染而非 ext.page({...}) 直接函数调用 — 直接调用会让 hooks 落在渲染器外触发 Invalid hook call.
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { campusExtensions } from './index'
import type { IExtensionPoint } from '../types'

vi.mock('../../api/ext', () => ({
    queryExtension: vi.fn(async (name: string) =>
    {
        switch(name)
        {
            case 'timetable':
                return [{ course: '数据结构', timeRange: '08:00-09:40', location: '二教 105' }]
            case 'exams':
                return [{ name: '高等数学期中考', date: '2026-10-06', daysUntil: 6, location: '一教 302' }]
            default:  //* agenda: 空议程走空态分支 (日程页 ExtEmpty 路径由它兑现)
                return []
        }
    }),
    setExtensionNotify: vi.fn(),
}))

function pageOf(id: string): IExtensionPoint
{
    const ext = campusExtensions.find(e => e.id === id)
    if(ext == null)
        throw new Error('扩展未注册')
    return ext
}

function renderPage(ext: IExtensionPoint): void
{
    const Page = ext.page
    render(<Page />)
}

function renderOverview(ext: IExtensionPoint): void
{
    if(ext.overview == null)
        throw new Error('扩展未提供总览')
    const Overview = ext.overview
    render(<Overview />)
}

describe('campus extensions (校园扩展三页, P3 转正)', () =>
{
    const timetable = pageOf('timetable')
    const exams = pageOf('exams')
    const agenda = pageOf('agenda')

    it('注册契约: id 与后端扩展名对齐 (详情路由与 notify 端点同名复用), 总览由课表独占注册', () =>
    {
        expect(campusExtensions.map(e => e.id)).toEqual(['timetable', 'exams', 'agenda'])
        expect(timetable.overview).toBeTruthy()
        expect(exams.overview).toBeUndefined()  //* 总览槽位单提供者: 不与课表竞争 (D9 首注册语义).
        expect(agenda.overview).toBeUndefined()
    })
    it('课表页渲染数据行 (查询数据上屏)', async () =>
    {
        renderPage(timetable)
        expect(await screen.findByText('08:00-09:40')).toBeInTheDocument()
        expect(screen.getByText(/数据结构/)).toBeInTheDocument()  //* 课程与地点合并为单文本节点, 用正则局部匹配.
        expect(screen.queryByText('加载中')).not.toBeInTheDocument()  //* 数据落定后加载态退场.
    })
    it('详情页无 Mock 徽标 (P3 转正: 数据一律查真实端点, mock 形态退场)', async () =>
    {
        renderPage(timetable)
        await screen.findByText('08:00-09:40')
        expect(screen.getByText('课表')).toBeInTheDocument()
        expect(screen.queryByText('Mock')).not.toBeInTheDocument()
    })
    it('考试页: 独立详情页渲染考试行 (spec §4 三页改查真实端点)', async () =>
    {
        renderPage(exams)
        expect(await screen.findByText('高等数学期中考')).toBeInTheDocument()
        expect(screen.getByText('2026-10-06 · 6 天后')).toBeInTheDocument()
    })
    it('总览渲染三张聚合卡 (课表摘要/近期日程/近期考试, 数据同源 queryExtension 三路并联)', async () =>
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
    it('移动端溢出防护: 数据行列表被横向滚动容器 (.ext-rows) 包裹 — 窄屏长内容滚动而非破版', async () =>
    {
        renderPage(timetable)
        await screen.findByText('08:00-09:40')
        const rows = document.querySelector('.ext-rows')
        expect(rows).not.toBeNull()
        expect(rows?.contains(screen.getByText(/数据结构/))).toBe(true)  //* 行本体确在滚动容器内.
    })
    it('移动端溢出防护 (总览): 有数据卡的行列表各自带滚动容器, 空数据卡走空态不产空容器', async () =>
    {
        renderOverview(timetable)
        await screen.findByText('今日课表摘要')
        //* 桩里 agenda 恒空 (ExtEmpty 路径由它兑现): 课表/考试两卡各产一个 .ext-rows, 日程卡不产 — 空态无溢出面.
        expect(document.querySelectorAll('.ext-rows')).toHaveLength(2)
        expect(screen.getByText(/暂无近期安排/)).toBeInTheDocument()
    })
    it('通知开关挂点: 课表详情页挂"开启提醒" (MVP 消费者 = 课表规则); 日程/考试未声明规则不挂', async () =>
    {
        renderPage(timetable)
        expect(await screen.findByRole('switch', { name: '开启提醒' })).toBeInTheDocument()
        cleanup()
        renderPage(agenda)
        await screen.findByText(/暂无近期安排/)
        expect(screen.queryByRole('switch', { name: '开启提醒' })).not.toBeInTheDocument()
    })
})
