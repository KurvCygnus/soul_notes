//* 天气胶囊测试 (评审整改后): 自加载今日天气, 空数据/失败隐藏, 芯片 SVG+状态词, popover 质性文案 + click-outside 关闭.
//* 数值化裁决: popover 不得出现分值/百分比 — 以显式反断言钉死 (积极/消极/焦虑与任何数字一律查无).
//* api 模块整体 mock, 不发真实 fetch. 失败家族用空数组/null 覆盖 (reject 路径与它们汇入同一隐藏漏斗).
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

    it('渲染 SVG 图标与状态词 (SUNNY → sun 图标 + 晴), 无 emoji 字符', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([DAY])
        render(<WeatherCapsule />)
        const chip = await screen.findByRole('button', { name: '今日情绪天气: 晴' })
        expect(chip.querySelector('svg')).toBeInTheDocument()
        expect(chip).toHaveTextContent('晴')
    })

    it('popover: 质性文案, 不出现任何数值化展示 (分值/百分比条一律查无)', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([DAY])
        const user = userEvent.setup()
        render(<WeatherCapsule />)
        await user.click(await screen.findByRole('button', { name: /今日情绪天气/ }))
        expect(screen.getByText('今天的情绪天气')).toBeInTheDocument()
        expect(screen.getByText('情绪晴朗, 把此刻的状态留在这里.')).toBeInTheDocument()
        expect(screen.getByText('由今天的 2 条记录汇聚')).toBeInTheDocument()
        //* 数值化禁令: 三个分值维度与旧 mini 条结构全部查无.
        expect(screen.queryByText('积极')).not.toBeInTheDocument()
        expect(screen.queryByText('消极')).not.toBeInTheDocument()
        expect(screen.queryByText('焦虑')).not.toBeInTheDocument()
        expect(document.querySelector('.weather-bar')).toBeNull()
        expect(screen.queryByText('80%')).not.toBeInTheDocument()
        await user.click(document.body)  //* 根外点击 → click-outside 收起.
        expect(screen.queryByText('今天的情绪天气')).not.toBeInTheDocument()
    })

    it('weatherType 对象形态 ({name}) 容忍: RAINY → rain 图标 + 雨', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue([{ ...DAY, weatherType: { name: 'RAINY' } }])
        render(<WeatherCapsule />)
        const chip = await screen.findByRole('button', { name: '今日情绪天气: 雨' })
        expect(chip.querySelector('svg')).toBeInTheDocument()
    })
})
