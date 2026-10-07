//* CandidateRows (候选追问幽灵行) 组件测试 (Task 8): 三条渲染 / 点击 onPick 直发回调 / 无 items 不渲染 /
//* 50ms 阶梯入场延迟 (内联 animationDelay 逐行递增). 纯展示组件, 不 mock 任何模块.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CandidateRows from './CandidateRows'

const ITEMS = ['今晚怎么更快入睡?', '怎么和室友沟通?', '考前呼吸练习怎么做?']

describe('CandidateRows (候选追问幽灵行)', () =>
{
    afterEach(() =>
    {
        cleanup()
        vi.restoreAllMocks()
    })

    it('渲染三条候选行, 文本逐条可见', () =>
    {
        render(<CandidateRows items={ITEMS} onPick={() => {}} />)
        for(const text of ITEMS)
            expect(screen.getByRole('button', { name: text })).toBeInTheDocument()
    })

    it('点击行: onPick 以该行文本回调 (直发语义)', async () =>
    {
        const u = userEvent.setup()
        const onPick = vi.fn()
        render(<CandidateRows items={ITEMS} onPick={onPick} />)
        await u.click(screen.getByRole('button', { name: ITEMS[1] }))
        expect(onPick).toHaveBeenCalledTimes(1)
        expect(onPick).toHaveBeenCalledWith(ITEMS[1])
    })

    it('无 items (空数组): 整组不渲染', () =>
    {
        const { container } = render(<CandidateRows items={[]} onPick={() => {}} />)
        expect(container.querySelector('.cands')).toBeNull()
        expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('50ms 阶梯入场: 各行内联 animationDelay 按下标递增', () =>
    {
        render(<CandidateRows items={ITEMS} onPick={() => {}} />)
        const rows = screen.getAllByRole('button')
        expect(rows).toHaveLength(3)
        expect(rows[0]).toHaveStyle({ animationDelay: '0ms' })
        expect(rows[1]).toHaveStyle({ animationDelay: '50ms' })
        expect(rows[2]).toHaveStyle({ animationDelay: '100ms' })
    })
})
