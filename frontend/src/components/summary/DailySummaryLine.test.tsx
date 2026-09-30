//* 每日总结「」行测试: 三态降级 (无总结 → 整件不渲染; 有总结 → 「」暗行 + 点击展开最近列表; 接口失败 → 不渲染且不重试),
//* click-outside 收起, popover 内日期 + 「」content 逐条渲染 (返回几条渲染几条, 上限由后端 limit 兜底).
//* api/summary 整体 mock, 不触网络; "不渲染"用 findBy 反向等待坐实.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DailySummaryLine from './DailySummaryLine'
import { getDailySummary, getRecentSummaries } from '../../api/summary'
import type { DailySummaryVo } from '../../types'

vi.mock('../../api/summary', () => ({ getDailySummary: vi.fn(), getRecentSummaries: vi.fn() }))

const mockDaily = vi.mocked(getDailySummary)
const mockRecent = vi.mocked(getRecentSummaries)

const TODAY: DailySummaryVo = { date: '2026-09-30', content: '今天你留下了一段温和的自我观察.' }
const RECENT: DailySummaryVo[] = [
    { date: '2026-09-30', content: '今天你留下了一段温和的自我观察.' },
    { date: '2026-09-29', content: '昨天你在焦虑里找到了一次呼吸.' },
    { date: '2026-09-28', content: '前天的你把情绪写了下来, 这本身就是照顾.' },
]

//* findBy 反向等待: 落定后仍查无「」行 (轮询期间每次 tick 都冲刷 act), "隐藏"是坐实而非碰巧.
function findByAbsentLine(): Promise<HTMLElement>
{
    return screen.findByRole('button', { name: /「/ }, { timeout: 300 })
}

describe('DailySummaryLine (每日总结「」行)', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks()
    })

    it('无总结 (null): 整件不渲染 (连占位都不留), 只请求一次不重试, 不取最近列表', async () =>
    {
        mockDaily.mockResolvedValue(null)
        const { container } = render(<DailySummaryLine />)
        await expect(findByAbsentLine()).rejects.toThrow()
        expect(container).toBeEmptyDOMElement()
        expect(mockDaily).toHaveBeenCalledOnce()
        expect(mockRecent).not.toHaveBeenCalled()
    })

    it('接口失败: 同样整件不渲染, 不重试 (无 401 死循环)', async () =>
    {
        mockDaily.mockRejectedValue(new Error('offline'))
        const { container } = render(<DailySummaryLine />)
        await expect(findByAbsentLine()).rejects.toThrow()
        expect(container).toBeEmptyDOMElement()
        expect(mockDaily).toHaveBeenCalledOnce()
        expect(mockRecent).not.toHaveBeenCalled()
    })

    it('有总结: 「」行在场 (角括号逐字可见), 初始收起 (aria-expanded=false), popover 不在场', async () =>
    {
        mockDaily.mockResolvedValue(TODAY)
        render(<DailySummaryLine />)
        const line = await screen.findByRole('button', { name: `「${TODAY.content}」` })
        expect(line).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('最近的每日总结')).not.toBeInTheDocument()
        expect(mockRecent).not.toHaveBeenCalled()  //* popover 惰性取数: 收起态不打点.
    })

    it('点击展开: 最近列表逐条渲染 (日期 + 「」content), 返回几条渲染几条, limit=7 与后端默认一致', async () =>
    {
        mockDaily.mockResolvedValue(TODAY)
        mockRecent.mockResolvedValue(RECENT)
        const user = userEvent.setup()
        render(<DailySummaryLine />)
        const line = await screen.findByRole('button', { name: `「${TODAY.content}」` })
        await user.click(line)
        expect(line).toHaveAttribute('aria-expanded', 'true')
        expect(await screen.findByText('最近的每日总结')).toBeInTheDocument()
        expect(await screen.findByText('「昨天你在焦虑里找到了一次呼吸.」')).toBeInTheDocument()
        //* 断言圈定在 popover 内: 今日条目与行本体内容相同 (同一天), 全局 getByText 会双命中.
        const pop = screen.getByText('最近的每日总结').closest('.summary-pop')
        expect(pop).not.toBeNull()
        for(const s of RECENT)
        {
            expect(within(pop as HTMLElement).getByText(s.date)).toBeInTheDocument()
            expect(within(pop as HTMLElement).getByText(`「${s.content}」`)).toBeInTheDocument()
        }
        expect(mockRecent).toHaveBeenCalledOnce()
        expect(mockRecent.mock.calls[0]?.[0]).toBe(7)
    })

    it('click-outside 收起 popover; 再点行本体重开并重新取数', async () =>
    {
        mockDaily.mockResolvedValue(TODAY)
        mockRecent.mockResolvedValue(RECENT)
        const user = userEvent.setup()
        render(<DailySummaryLine />)
        const line = await screen.findByRole('button', { name: `「${TODAY.content}」` })
        await user.click(line)
        expect(await screen.findByText('最近的每日总结')).toBeInTheDocument()

        await user.click(document.body)  //* 根外按下 → document mousedown 收起.
        expect(screen.queryByText('最近的每日总结')).not.toBeInTheDocument()
        expect(line).toHaveAttribute('aria-expanded', 'false')

        await user.click(line)
        expect(await screen.findByText('最近的每日总结')).toBeInTheDocument()
        expect(mockRecent).toHaveBeenCalledTimes(2)  //* 每次打开都取新鲜值, 不复读缓存.
    })

    it('最近列表取数失败与空列表同漏斗: popover 不炸, 落"无可展示"文案', async () =>
    {
        mockDaily.mockResolvedValue(TODAY)
        mockRecent.mockRejectedValue(new Error('offline'))
        const user = userEvent.setup()
        const first = render(<DailySummaryLine />)
        await user.click(await screen.findByRole('button', { name: `「${TODAY.content}」` }))
        expect(await screen.findByText('还没有可展示的总结.')).toBeInTheDocument()
        first.unmount()  //* 同测两态: 先卸载失败用例, 避免两次挂载的节点互相污染缺席断言.

        mockRecent.mockResolvedValue([])
        render(<DailySummaryLine />)
        await user.click(await screen.findByRole('button', { name: `「${TODAY.content}」` }))
        expect(await screen.findByText('还没有可展示的总结.')).toBeInTheDocument()
    })
})
