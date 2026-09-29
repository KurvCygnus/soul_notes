//* 天气胶囊 (Task 12): 主区顶栏的情绪天气芯片 — 符号 + 状态词, 点开 popover 展示三分值 mini 条.
//* 自加载今日天气 (getWeather 今日区间): 401/网络故障/数据缺席 (null) 一律整件隐藏 (fail-silent, 绝不阻塞聊天主路径,
//* 也不与登录浮层抢戏 — 401 的全局广播由 [[api]] 统一处理). 分值语义: 积极/消极/焦虑, 后端区间 0.0~1.0,
//* 前端换算为整百分比展示; 焦虑条用琥珀令牌 (警示但不医疗化), 配色全部取自设计令牌.
//* Task 14 空态裁决: 请求"成功但今日无记录" (空数组) 不再整件隐藏, 改显非交互空态文案 — 失败与空数据语义不同,
//* 前者是"暂时看不到", 后者是"今天还没有", 混在同一漏斗会让新用户误以为功能缺失.
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { getWeather } from '../../api/diary'
import { weatherGlyph, weatherWord } from '../../utils/weatherGlyph'
import type { WeatherDay } from '../../types'

//* 本地时区日期串: 手拼 yyyy-MM-dd, 不用 toISOString (UTC 零点截断会把晚间写成"昨天").
function localToday(): string
{
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

//* 0.0~1.0 分值 → 0~100 整百分比: 钳制防脏数据把 mini 条撑爆或缩没.
function clampPct(v: number): number
{
    return Math.round(Math.min(1, Math.max(0, v)) * 100)
}

export default function WeatherCapsule(): ReactElement
{
    const [day, setDay] = useState<WeatherDay | null>(null)
    //* 成功但今日无记录: 与失败家族分流, 空态文案的开关 (null 数据缺席仍归失败 → 整件隐藏).
    const [emptyDay, setEmptyDay] = useState(false)
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)

    useEffect(() =>
    {
        let alive = true
        const today = localToday()
        getWeather(today, today).
            then(list =>
            {
                if(!alive || list == null)
                    return  //! data 缺席 (null) 归失败家族维持隐藏: 只有明确的空数组才代表"今天还没有记录".
                if(list.length > 0)
                    setDay(list[0] ?? null)
                else
                    setEmptyDay(true)
            }).
            catch(() => {})  //! 失败即隐藏 (与 null 数据同漏斗), 不重试: 无 401 死循环.
        return () => { alive = false }
    }, [])

    //* click-outside 收起: open 期间挂 document mousedown, 根外按下即收; effect cleanup 保证卸载/收起时移除监听.
    useEffect(() =>
    {
        if(!open)
            return
        const onDocMouseDown = (e: MouseEvent): void =>
        {
            if(rootRef.current != null && !rootRef.current.contains(e.target as Node))
                setOpen(false)
        }
        document.addEventListener('mousedown', onDocMouseDown)
        return () => { document.removeEventListener('mousedown', onDocMouseDown) }
    }, [open])

    if(day == null && !emptyDay)
        return <></>  //* 失败/数据缺席形态: 连占位都不留, 顶栏保持素净 (fail-silent 契约不变).
    if(day == null)
    {
        //* 空态形态 (Task 14): 成功但今日无记录 — 非交互 div (没有可展开的 popover), 文案顺手指路"记一笔".
        return (
            <div className="weather-chip weather-chip-empty">今天还没有情绪记录, 记一笔就会生成.</div>
        )
    }

    const word = weatherWord(day.weatherType)

    return (
        <div className="weather-capsule" ref={rootRef}>
            <button
                type="button"
                className="weather-chip"
                aria-expanded={open}
                aria-label={`今日情绪天气: ${word}`}
                onClick={() => setOpen(o => !o)}
            >
                <span aria-hidden="true">{weatherGlyph(day.weatherType)}</span>
                <span>{word}</span>
            </button>
            {open && (
                <div className="weather-pop">
                    <p className="weather-pop-title">今天的情绪天气</p>
                    <div className="weather-bar">
                        <div className="weather-bar-label"><span>积极</span><span>{clampPct(day.positiveAvg)}</span></div>
                        <div className="weather-bar-track"><div className="weather-bar-fill weather-fill-positive" style={{ width: `${clampPct(day.positiveAvg)}%` }} /></div>
                    </div>
                    <div className="weather-bar">
                        <div className="weather-bar-label"><span>消极</span><span>{clampPct(day.negativeAvg)}</span></div>
                        <div className="weather-bar-track"><div className="weather-bar-fill weather-fill-negative" style={{ width: `${clampPct(day.negativeAvg)}%` }} /></div>
                    </div>
                    <div className="weather-bar">
                        <div className="weather-bar-label"><span>焦虑</span><span>{clampPct(day.anxietyAvg)}</span></div>
                        <div className="weather-bar-track"><div className="weather-bar-fill weather-fill-anxiety" style={{ width: `${clampPct(day.anxietyAvg)}%` }} /></div>
                    </div>
                    {day.entryCount > 0 && <p className="weather-pop-foot">由今天的 {day.entryCount} 条记录汇聚</p>}
                </div>
            )}
        </div>
    )
}
