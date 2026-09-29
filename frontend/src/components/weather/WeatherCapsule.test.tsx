//* 天气胶囊测试: 自加载今日天气, 空数据/失败隐藏, 芯片符号+状态词, popover 三分值 mini 条 + click-outside 关闭.
//* api 模块整体 mock, 不发真实 fetch. 失败家族用空数组/null 覆盖 (reject 路径与它们汇入同一隐藏漏斗, 见 task-12 报告).
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeatherCapsule from './WeatherCapsule'
import { getWeather } from '../../api/diary'
import type { WeatherDay } from '../../types'

vi.mock('../../api/diary', () => ({ getWeather: vi.fn() }))

const mockGet = vi.mocked(getWeather)

const DAY: WeatherDay = { date: '2026-09-29', weatherType: 'SUNNY', positiveAvg: 0.8, negativeAvg: 0.1, anxietyAvg: 0.2, entryCount: 2 }

//* findBy 反向等待: 落定后仍查无芯片 (轮询期间每次 tick 都冲刷 act), "隐藏"是坐实而非碰巧.
function findByAbsentChip(): Promise<HTMLElement>
{
    return screen.findByRole('button', { name: /今日情绪天气/ }, { timeout: 300 })
}

describe('WeatherCapsule (顶栏天气胶囊)', () =>
{
    it('空数组整件隐藏, 今日区间只请求一次 (本地时区 yyyy-MM-dd)', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([])
        render(<WeatherCapsule />)
        await expect(findByAbsentChip()).rejects.toThrow()
        expect(mockGet).toHaveBeenCalledOnce()
        const [start, end] = mockGet.mock.calls[0] ?? ['', '']
        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(start).toBe(end)
    })

    it('data 缺席 (null) 同样隐藏', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue(null as unknown as WeatherDay[])
        render(<WeatherCapsule />)
        await expect(findByAbsentChip()).rejects.toThrow()
    })

    it('渲染符号与状态词 (SUNNY → ☀️ 晴)', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([DAY])
        render(<WeatherCapsule />)
        const chip = await screen.findByRole('button', { name: '今日情绪天气: 晴' })
        expect(chip).toHaveTextContent('☀️')
        expect(chip).toHaveTextContent('晴')
    })

    it('popover: 点击芯片展开三分值 mini 条, 点击外部收起', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([DAY])
        const user = userEvent.setup()
        render(<WeatherCapsule />)
        await user.click(await screen.findByRole('button', { name: /今日情绪天气/ }))
        expect(screen.getByText('积极')).toBeInTheDocument()
        expect(screen.getByText('消极')).toBeInTheDocument()
        expect(screen.getByText('焦虑')).toBeInTheDocument()
        expect(screen.getByText('80')).toBeInTheDocument()  //* 后端 0.0~1.0 → 前端换算为整百分比.
        expect(screen.getByText('10')).toBeInTheDocument()
        expect(screen.getByText('20')).toBeInTheDocument()
        expect(screen.getByText('积极').closest('.weather-bar')?.querySelector('.weather-bar-fill')).toHaveStyle({ width: '80%' })
        await user.click(document.body)  //* 根外点击 → click-outside 收起.
        expect(screen.queryByText('积极')).not.toBeInTheDocument()
    })

    it('weatherType 对象形态 ({name}) 容忍: RAINY → 🌧️ 雨', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([{ ...DAY, weatherType: { name: 'RAINY' } }])
        render(<WeatherCapsule />)
        const chip = await screen.findByRole('button', { name: '今日情绪天气: 雨' })
        expect(chip).toHaveTextContent('🌧️')
    })
})
