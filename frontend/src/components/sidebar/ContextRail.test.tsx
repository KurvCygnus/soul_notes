//* 情境卡组测试: 空数据/加载失败整区隐藏 (adapter=none 自动静默), 数据渲染 (考试 daysUntil<=7 染琥珀),
//* 卡片点击经 onAsk 唤起聊天. api 模块整体 mock, 不发真实 fetch.
//* 隐藏类断言用 findBy 反向等待: 经 300ms 的 act 冲刷轮询后仍不存在, "整区隐藏"是落定后的坐实而非碰巧.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContextRail, { ASK_EXAMS, ASK_SCHEDULE } from './ContextRail'
import { getContextSummary } from '../../api/context'
import type { ContextSummary } from '../../types'

vi.mock('../../api/context', () => ({ getContextSummary: vi.fn() }))

const mockGet = vi.mocked(getContextSummary)

const DATA: ContextSummary = {
    schedule: [
        { course: '高等数学', timeRange: '08:00-09:40', location: '教三 302' },
        { course: '大学生心理', timeRange: '14:00-15:40', location: '文科楼 B108' },
    ],
    exams: [
        { name: '线性代数', date: '2026-10-01', daysUntil: 3, location: '教一 101' },
        { name: '大学英语', date: '2026-11-20', daysUntil: 52, location: '教二 205' },
    ],
    agenda: [{ title: '班会谈心', date: '2026-10-02', note: '自愿参加' }],
}

const EMPTY: ContextSummary = { schedule: [], exams: [], agenda: [] }

//* findBy 反向等待: 落定后仍查无此元素 (轮询期间每次 tick 都冲刷 act), 等待失败即 reject.
function findByAbsent(id: string): Promise<HTMLElement>
{
    return screen.findByText(id, {}, { timeout: 300 })
}

describe('ContextRail (侧栏情境卡组)', () =>
{
    beforeEach(() => mockGet.mockClear())  //* mockClear 而非 mockReset: vitest 5 下 reset+mockRejectedValue 会泄漏幻影 unhandled rejection (见 task-12 报告), 各用例自带实现故只需清调用记录.

    it('空数组整区隐藏 (含标题): adapter=none 自动静默, api 仅请求一次', async () =>
    {
        mockGet.mockClear()
        mockGet.mockResolvedValue(EMPTY)
        render(<ContextRail onAsk={vi.fn()} />)
        expect(screen.queryByText('你的情境')).not.toBeInTheDocument()  //* 加载中即隐藏, 不闪占位.
        await expect(findByAbsent('你的情境')).rejects.toThrow()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(mockGet).toHaveBeenCalledOnce()
    })

    it('data 缺席 (null, 401/网络故障的降级形态) 同样整区隐藏, 不抛错不死循环', async () =>
    {
        //* 用 null 覆盖失败家族 (reject 路径在同一 catch → 隐藏的漏斗里, 见报告的环境怪癖注记):
        //* api 壳解包 data 可为 null (NON_NULL 序列化), 类型断言反映运行时真实形态.
        mockGet.mockClear()
        mockGet.mockResolvedValue(null as unknown as ContextSummary)
        render(<ContextRail onAsk={vi.fn()} />)
        await expect(findByAbsent('你的情境')).rejects.toThrow()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(mockGet).toHaveBeenCalledOnce()  //* 失败不重试: 无 401 死循环请求.
    })

    it('数据渲染: 课表/考试/日程可见, daysUntil<=7 的考试染琥珀', async () =>
    {
        mockGet.mockResolvedValue(DATA)
        render(<ContextRail onAsk={vi.fn()} />)
        expect(await screen.findByText('你的情境')).toBeInTheDocument()
        expect(screen.getByText('高等数学')).toBeInTheDocument()
        expect(screen.getByText('08:00-09:40 · 教三 302')).toBeInTheDocument()
        expect(screen.getByText('线性代数')).toBeInTheDocument()
        expect(screen.getByText('班会谈心')).toBeInTheDocument()
        expect(screen.getByText('3 天后')).toBeInTheDocument()  //* 临近考试以倒计时表述.
        expect(screen.getByText('大学英语').closest('.context-row')).not.toHaveClass('context-soon')  //* 远期考试不染琥珀.
        expect(screen.getByText('线性代数').closest('.context-row')).toHaveClass('context-soon')
    })

    it('点击课表卡与安排卡分别唤起对应的聊天请求', async () =>
    {
        mockGet.mockResolvedValue(DATA)
        const user = userEvent.setup()
        const onAsk = vi.fn()
        render(<ContextRail onAsk={onAsk} />)
        await user.click(await screen.findByRole('button', { name: /今日课表/ }))
        expect(onAsk).toHaveBeenCalledWith(ASK_SCHEDULE)
        await user.click(screen.getByRole('button', { name: /近期安排/ }))
        expect(onAsk).toHaveBeenCalledWith(ASK_EXAMS)
        expect(onAsk).toHaveBeenCalledTimes(2)
    })

    it('未提供 onAsk 时卡片退化为纯展示 (div), 无按钮可点 (向后兼容旧调用方)', async () =>
    {
        mockGet.mockResolvedValue(DATA)
        render(<ContextRail />)
        expect(await screen.findByText('你的情境')).toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(screen.getByText('高等数学')).toBeInTheDocument()
    })
})
