//* 时间分组纯函数测试: 注入 now 保证时区无关 (所有期望日期都用本地构造再转 ISO 往返).
import { describe, expect, it } from 'vitest'
import { formatRelative, groupMessages } from './group'

//* 注入时钟: 本地 2026-09-28 正午. 所有消息时间同样本地构造, 经 toISOString 往返不受运行机时区影响.
const NOW = new Date(2026, 8, 28, 12, 0, 0)

describe('groupMessages (消息时间分组)', () =>
{
    it('今天的消息归入 "今天" 桶, 原始 ts 透传', () =>
    {
        const iso = new Date(2026, 8, 28, 9, 30, 0).toISOString()
        const groups = groupMessages([
            { role: 'user', content: '最近有点累', timestamp: iso },
            { role: 'assistant', content: '辛苦了, 想聊聊是什么让你疲惫吗?', timestamp: new Date(2026, 8, 28, 9, 31, 0).toISOString() },
        ], NOW)
        expect(groups).toHaveLength(1)
        expect(groups[0]?.label).toBe('今天')
        expect(groups[0]?.items).toHaveLength(2)
        expect(groups[0]?.items[0]?.ts).toBe(iso)
    })

    it('昨天的消息归入 "昨天" 桶 (注入 now, 跨月边界)', () =>
    {
        //* 9 月 1 日的昨天是 8 月 31 日: 验证 setDate 翻月不差一.
        const monthStart = new Date(2026, 8, 1, 12, 0, 0)
        const groups = groupMessages([
            { role: 'user', content: '八月最后一天的烦恼', ts: new Date(2026, 7, 31, 23, 59, 0).toISOString() },
        ], monthStart)
        expect(groups).toHaveLength(1)
        expect(groups[0]?.label).toBe('昨天')
    })

    it('更早的消息以 M-D 标签分桶', () =>
    {
        const groups = groupMessages([
            { role: 'user', content: '九月中旬的记录', ts: new Date(2026, 8, 15, 8, 0, 0).toISOString() },
        ], NOW)
        expect(groups).toHaveLength(1)
        expect(groups[0]?.label).toBe('9-15')
    })

    it('无 ts 条目混入当前桶, 不另起新桶', () =>
    {
        const groups = groupMessages([
            { role: 'user', content: '今天第一条', timestamp: new Date(2026, 8, 28, 10, 0, 0).toISOString() },
            { role: 'assistant', content: '乐观消息, 无 timestamp' },  //* 流式乐观消息形态 (ChatMessage 无 timestamp 键).
            { role: 'user', content: '存量消息, ts 为 null', ts: null },  //* 历史消息形态 (ChatHistoryMessage.ts null).
        ], NOW)
        expect(groups).toHaveLength(1)
        expect(groups[0]?.label).toBe('今天')
        expect(groups[0]?.items).toHaveLength(3)
        expect(groups[0]?.items[1]?.ts).toBeNull()
    })

    it('首条即无时间: 开无标签隐式桶, 后续日期条目自然另起桶', () =>
    {
        const groups = groupMessages([
            { role: 'user', content: '新对话乐观消息' },
            { role: 'user', content: '昨天的消息', ts: new Date(2026, 8, 27, 8, 0, 0).toISOString() },
        ], NOW)
        expect(groups).toEqual([
            { label: '', items: [expect.objectContaining({ content: '新对话乐观消息' })] },
            { label: '昨天', items: [expect.objectContaining({ content: '昨天的消息' })] },
        ])
    })

    it('空输入返回空数组; 非法时间串视为无时间并入隐式桶', () =>
    {
        expect(groupMessages([], NOW)).toEqual([])
        const groups = groupMessages([{ role: 'user', content: '坏时间戳', ts: 'not-a-date' }], NOW)
        expect(groups).toEqual([{ label: '', items: [expect.objectContaining({ content: '坏时间戳', ts: null })] }])
    })
})

describe('formatRelative (相对时间)', () =>
{
    it('±60s 为刚刚, 60s 起为 N 分钟前, 60m 整落到同日 H:mm (边界逐秒验证)', () =>
    {
        expect(formatRelative(new Date(2026, 8, 28, 11, 59, 1).toISOString(), NOW)).toBe('刚刚')
        expect(formatRelative(new Date(2026, 8, 28, 12, 0, 30).toISOString(), NOW)).toBe('刚刚')  //* 未来 30s 的时钟偏移也归刚刚.
        expect(formatRelative(new Date(2026, 8, 28, 11, 59, 0).toISOString(), NOW)).toBe('1 分钟前')
        expect(formatRelative(new Date(2026, 8, 28, 11, 0, 1).toISOString(), NOW)).toBe('59 分钟前')
        expect(formatRelative(new Date(2026, 8, 28, 11, 0, 0).toISOString(), NOW)).toBe('11:00')  //* 满 60 分钟改走同日时刻.
    })

    it('昨天以"昨天"呈现, 更早回退 M-D, 非法时间串返回空串', () =>
    {
        expect(formatRelative(new Date(2026, 8, 27, 23, 30, 0).toISOString(), NOW)).toBe('昨天')
        expect(formatRelative(new Date(2026, 8, 15, 8, 5, 0).toISOString(), NOW)).toBe('9-15')
        expect(formatRelative('not-a-date', NOW)).toBe('')
    })
})
