//* 侧栏会话行相对时间: 今天=HH:mm / 昨天="昨天" / 7天内=周X / 更早=MM-DD (日历日差判定, 不受时刻影响).
//* 纯函数: now 可注入 (测试固定时钟), 缺省取当前时间; 非法输入回落空串, 展示侧对空串不渲染时间槽.
const WEEKDAYS = '日一二三四五六'

/**
 * 会话最后更新时间的相对展示文案. 分支按本地日历日差 (now 当日 0 点与目标当日 0 点的差) 判定:
 * 0 = 今天 (HH:mm), 1 = 昨天, 2..6 = 周X, >= 7 = MM-DD; 负差 (时钟偏斜导致的未来时间) 按今天兜底.
 */
export function relTime(iso: string, now: Date = new Date()): string
{
    const target = new Date(iso)
    if(Number.isNaN(target.getTime()))
        return ''
    const midnight = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round((midnight(now) - midnight(target)) / 86_400_000)
    if(days <= 0)
        return `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`
    if(days === 1)
        return '昨天'
    if(days < 7)
        return `周${WEEKDAYS[target.getDay()]}`
    return `${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}
