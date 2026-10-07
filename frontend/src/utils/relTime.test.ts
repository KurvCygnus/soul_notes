//* relTime 测试: 相对时间四分支 (今天=HH:mm / 昨天=昨天 / 7天内=周X / 更早=MM-DD).
//* 固定 now (函数签名 relTime(iso, now?)) 驱动, 不依赖真实时钟; 用例覆盖分支边界与防御性输入.
import { describe, expect, it } from 'vitest'
import { relTime } from './relTime'

//* 固定基准: 2026-10-05 12:00 (本地时区) — 分支判定只看日历日差, 与测试机时区无关.
const NOW = new Date(2026, 9, 5, 12, 0, 0)

describe('relTime (侧栏相对时间)', () =>
{
    it('今天: 只给 HH:mm (零填充)', () =>
    {
        expect(relTime('2026-10-05T09:05:00', NOW)).toBe('09:05')
        expect(relTime('2026-10-05T23:07:00', NOW)).toBe('23:07')
    })

    it('昨天: 恒为字面 "昨天" (不携带时刻)', () =>
    {
        expect(relTime('2026-10-04T23:59:00', NOW)).toBe('昨天')
        expect(relTime('2026-10-04T00:00:00', NOW)).toBe('昨天')
    })

    it('7天内 (日差 2..6): 周X (目标日的星期名)', () =>
    {
        expect(relTime('2026-10-03T08:00:00', NOW)).toBe('周六')  //* 日差 2.
        expect(relTime('2026-09-29T08:00:00', NOW)).toBe('周二')  //* 日差 6 (7天内最后一档).
    })

    it('更早 (日差 >= 7): MM-DD (零填充)', () =>
    {
        expect(relTime('2026-09-28T10:00:00', NOW)).toBe('09-28')  //* 日差恰好 7: 已出 "7天内" 界.
        expect(relTime('2025-01-05T10:00:00', NOW)).toBe('01-05')
    })

    it('未来时间 (时钟偏斜): 按今天处理给 HH:mm, 不产出负日差分支', () =>
    {
        expect(relTime('2026-10-06T08:15:00', NOW)).toBe('08:15')
    })

    it('非法时间串: 回落空串 (展示侧不渲染时间槽, 不抛错)', () =>
    {
        expect(relTime('not-a-date', NOW)).toBe('')
    })
})
