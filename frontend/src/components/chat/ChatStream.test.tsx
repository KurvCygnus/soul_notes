//* ChatStream (消息流) 挂载点测试 (Task 8): 候选追问行只允许出现在最新一条 AI 回复下方 —
//* 末条为 user / 无 followups 时整组缺席. 纯渲染判定, 不涉发送管线.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ChatStream from './ChatStream'
import type { IDisplayMessage } from '../../utils/group'

const AI_MSG: IDisplayMessage = { role: 'assistant', content: '我在听, 慢慢说.', ts: '2026-10-05T09:05:00' }
const USER_MSG: IDisplayMessage = { role: 'user', content: '我最近压力有点大', ts: null }

describe('ChatStream (候选行挂载点)', () =>
{
    afterEach(() =>
    {
        cleanup()
        vi.restoreAllMocks()
    })

    it('末条为 AI 回复: 候选行挂其下方, 三条可见', () =>
    {
        render(
            <ChatStream
                messages={[USER_MSG, AI_MSG]}
                streaming={false}
                followups={['问一', '问二', '问三']}
                onPickFollowup={() => {}}
            />,
        )
        expect(screen.getByRole('button', { name: '问一' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '问三' })).toBeInTheDocument()
    })

    it('末条为 user (新一轮已发送): 候选行不得渲染, 即使 followups 尚有旧值', () =>
    {
        render(
            <ChatStream
                messages={[AI_MSG, USER_MSG]}
                streaming={false}
                followups={['旧问一', '旧问二']}
                onPickFollowup={() => {}}
            />,
        )
        expect(screen.queryByRole('button', { name: '旧问一' })).not.toBeInTheDocument()
    })

    it('followups 缺席/为空: 不渲染', () =>
    {
        const { container } = render(
            <ChatStream messages={[USER_MSG, AI_MSG]} streaming={false} />,
        )
        expect(container.querySelector('.cands')).toBeNull()
    })
})
