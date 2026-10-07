//* 工作台视图测试 (RED 先行): 三视图渲染 / 行点击展开时间线 / 空态 / 等级筛选 / 403 降级 / 今日新增口径.
//* api 层整体 mock (vi.mock('../api/clinical')): 断言停在模块边界 — 端点拼参归 api 层, 渲染语义归视图.
//* 403 用例构造真实 [[ApiError]] 实例: 视图按 instanceof + code 判定降级, mock 必须同构.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorkbenchView from './WorkbenchView'
import { ApiError } from '../api/http'
import { getStatsSummary, listAssessments, listStudentAssessments } from '../api/clinical'
import type { AssessmentVo, StatsSummary } from '../types'

vi.mock('../api/clinical', () => ({
    listAssessments: vi.fn(),
    listStudentAssessments: vi.fn(),
    getStatsSummary: vi.fn(),
}))

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

//* 队列样本刻意乱序 (YELLOW 更旧在前): 钉住视图按 createdAt 倒序渲染的排序语义.
const ROW_YELLOW: AssessmentVo =
    { id: 'a1', userId: UUID_A, displayName: '学生 #ab12cd34', riskLevel: 'YELLOW', summary: '持续失眠, 建议关注', tags: { tags: ['insomnia'] }, sessionId: 'sa', createdAt: '2026-10-04T09:00:00Z' }
const ROW_RED: AssessmentVo =
    { id: 'a2', userId: UUID_B, displayName: '王小明', riskLevel: 'RED', summary: '高危信号, 建议立即介入', tags: { tags: ['crisis', 'self-harm'] }, sessionId: 'sb', createdAt: '2026-10-05T08:00:00Z' }

const STATS: StatsSummary =
    {
        byLevel: { RED: 3, YELLOW: 2 },
        byDay: [{ date: '2026-10-04', yellow: 1, red: 1 }, { date: '2026-10-05', yellow: 2, red: 1 }],
        totalStudents: 7,
    }

//* 数字卡取数助手: 数字卡 = label + num 同居一个 .wb-card, 经可见文案定位卡片再取数值.
function statNum(label: string): string | undefined
{
    return screen.getByText(label).closest('.wb-card')?.querySelector('.wb-card-num')?.textContent
}

describe('WorkbenchView (咨询员工作台)', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks()
        vi.mocked(listAssessments).mockResolvedValue([])
        vi.mocked(listStudentAssessments).mockResolvedValue([])
        vi.mocked(getStatsSummary).mockResolvedValue(STATS)
    })
    afterEach(() =>
    {
        cleanup()
        vi.useRealTimers()  //* 今日新增用例装过 Date 假钟, 用例间归还防串扰.
    })

    it('风险队列: 表格按评估时间倒序渲染, 等级徽标/学生/摘要在场', async () =>
    {
        vi.mocked(listAssessments).mockResolvedValue([ROW_YELLOW, ROW_RED])
        render(<WorkbenchView />)
        expect(await screen.findByText('王小明')).toBeInTheDocument()
        const rows = document.querySelectorAll('tbody tr')
        expect(rows.length).toBe(2)
        expect(rows[0].textContent).toContain('王小明')  //* 更新的 RED 行在前 (倒序).
        expect(rows[0].textContent).toContain('高危信号, 建议立即介入')
        expect(rows[1].textContent).toContain('学生 #ab12cd34')
        expect(document.querySelector('.wb-badge-red')).not.toBeNull()
        expect(document.querySelector('.wb-badge-yellow')).not.toBeNull()
    })

    it('行点击展开该学生时间线: 调时间线端点 (UUID) 就地渲染事件列表, 再点收起', async () =>
    {
        vi.mocked(listAssessments).mockResolvedValue([ROW_RED])
        vi.mocked(listStudentAssessments).mockResolvedValue([ROW_RED])
        const user = userEvent.setup()
        render(<WorkbenchView />)
        await screen.findByText('王小明')

        await user.click(screen.getByText('王小明').closest('tr')!)
        expect(await screen.findByText('王小明 的评估时间线')).toBeInTheDocument()
        expect(listStudentAssessments).toHaveBeenCalledWith(UUID_B)
        expect(screen.getByText('crisis')).toBeInTheDocument()  //* 标签逐个渲染.
        expect(screen.getByText('self-harm')).toBeInTheDocument()
        //* 摘要在队列行与时间线事件里都出现 (同文案双处), 就地断言展开区而非全屏 getByText.
        expect(document.querySelector('.wb-expand')?.textContent).toContain('高危信号, 建议立即介入')

        await user.click(screen.getByText('王小明').closest('tr')!)
        expect(screen.queryByText('王小明 的评估时间线')).not.toBeInTheDocument()  //* 再点收起.
    })

    it('队列空态: 无评估记录展示空态文案', async () =>
    {
        render(<WorkbenchView />)
        expect(await screen.findByText('暂无风险评估记录')).toBeInTheDocument()
    })

    it('脱敏短码学生: 行展开就地降级提示, 不调时间线端点 (端点只收 UUID, 实测短码 400)', async () =>
    {
        vi.mocked(listAssessments).mockResolvedValue([{ ...ROW_YELLOW, userId: '8e4bc2b7', displayName: '学生 #8e4bc2b7' }])
        const user = userEvent.setup()
        render(<WorkbenchView />)
        await screen.findByText('学生 #8e4bc2b7')
        await user.click(screen.getByText('学生 #8e4bc2b7').closest('tr')!)
        expect(await screen.findByText('该学生标识为脱敏短码, 暂无法回查时间线')).toBeInTheDocument()
        expect(listStudentAssessments).not.toHaveBeenCalled()
    })

    it('学生时间线视图: 输入 UUID 查询渲染事件列表, 空结果展示空态', async () =>
    {
        vi.mocked(listStudentAssessments).mockResolvedValue([ROW_RED])
        const user = userEvent.setup()
        render(<WorkbenchView />)
        await user.click(screen.getByRole('tab', { name: '学生时间线' }))
        await user.type(screen.getByLabelText('学生 ID'), UUID_B)
        await user.click(screen.getByRole('button', { name: '查询' }))
        expect(await screen.findByText('高危信号, 建议立即介入')).toBeInTheDocument()
        expect(listStudentAssessments).toHaveBeenCalledWith(UUID_B)

        vi.mocked(listStudentAssessments).mockResolvedValue([])
        await user.click(screen.getByRole('button', { name: '查询' }))
        expect(await screen.findByText('该学生暂无评估记录')).toBeInTheDocument()
    })

    it('学生时间线视图: 非法 ID (短码) 就地提示, 不发起请求', async () =>
    {
        const user = userEvent.setup()
        render(<WorkbenchView />)
        await user.click(screen.getByRole('tab', { name: '学生时间线' }))
        await user.type(screen.getByLabelText('学生 ID'), '8e4bc2b7')
        await user.click(screen.getByRole('button', { name: '查询' }))
        expect(await screen.findByText('请输入完整的学生 ID (UUID)')).toBeInTheDocument()
        expect(listStudentAssessments).not.toHaveBeenCalled()
    })

    it('聚合统计: 数字卡渲染 红色/黄色/总数/今日新增 (今日 = 本地日历日在 byDay 的黄红合计)', async () =>
    {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 5, 10, 0, 0) })
        render(<WorkbenchView />)
        fireEvent.click(screen.getByRole('tab', { name: '聚合统计' }))
        expect(await screen.findByText('统计窗口: 近 7 天, 覆盖学生 7 名')).toBeInTheDocument()
        expect(statNum('红色预警')).toBe('3')
        expect(statNum('黄色预警')).toBe('2')
        expect(statNum('评估总数')).toBe('5')
        expect(statNum('今日新增')).toBe('3')  //* 2026-10-05 当日 yellow 2 + red 1.
    })

    it('等级筛选: 点红色预警按 level=RED 重查', async () =>
    {
        const user = userEvent.setup()
        render(<WorkbenchView />)
        await screen.findByText('暂无风险评估记录')
        await user.click(screen.getByRole('button', { name: '红色预警' }))
        await waitFor(() => expect(listAssessments).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'RED' })))
    })

    it('端点 403 降级: 整页替换为无权限提示页, 三视图不可达', async () =>
    {
        vi.mocked(listAssessments).mockRejectedValue(new ApiError(403, '禁止访问'))
        render(<WorkbenchView />)
        expect(await screen.findByText('无权访问咨询员工作台')).toBeInTheDocument()
        expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })

    it('端点 403 降级 (延迟发现): 队列正常而统计端点 403 时同样整页降级', async () =>
    {
        vi.mocked(getStatsSummary).mockRejectedValue(new ApiError(403, '禁止访问'))
        const user = userEvent.setup()
        render(<WorkbenchView />)
        expect(await screen.findByText('暂无风险评估记录')).toBeInTheDocument()  //* 队列视图正常.
        await user.click(screen.getByRole('tab', { name: '聚合统计' }))
        expect(await screen.findByText('无权访问咨询员工作台')).toBeInTheDocument()
    })

    it('端点其他失败: 行内错误提示可重试, 不触发降级页', async () =>
    {
        //* once 队列 FIFO: 第 1 次取数回网络错误, 重试 (第 2 次) 回正常数据 — 两次注册都在 render 前.
        vi.mocked(listAssessments).mockRejectedValueOnce(new ApiError(-1, '网络连接不可用, 请检查网络后重试'))
        vi.mocked(listAssessments).mockResolvedValueOnce([ROW_RED])
        const user = userEvent.setup()
        render(<WorkbenchView />)
        expect(await screen.findByText('网络连接不可用, 请检查网络后重试')).toBeInTheDocument()
        expect(screen.queryByText('无权访问咨询员工作台')).not.toBeInTheDocument()  //* 非 403 不降级: 三视图仍在场.
        await user.click(screen.getByRole('button', { name: '重试' }))
        expect(await screen.findByText('王小明')).toBeInTheDocument()
    })
})
