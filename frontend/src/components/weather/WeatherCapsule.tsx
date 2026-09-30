//* 天气胶囊 (Task 12, 评审整改): 主区顶栏的情绪天气芯片 — SVG 符号 + 状态词, 点开 popover 展示质性描述.
//* 评审裁决: 情绪天气不得以数值量化呈现心理状态 (不做分数/百分比条) — 数值只留在后端分析链作为天气映射引擎,
//* 前端一律以"天气隐喻 + 质性文案"表达, 与非医疗化人设同源.
//* 自加载今日天气 (getWeather 今日区间): 401/网络故障/数据缺席 (null) 一律整件隐藏 (fail-silent, 绝不阻塞聊天主路径).
//* Task 14 空态裁决保留: 请求"成功但今日无记录" (空数组) 显非交互空态文案, 与失败语义分流.
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { getWeather } from '../../api/diary'
import { weatherCopyKey, weatherIconKey, weatherWord } from '../../utils/weatherIcon'
import Icon from '../ui/Icon'
import type { WeatherDay } from '../../types'

//* 本地时区日期串: 手拼 yyyy-MM-dd, 不用 toISOString (UTC 零点截断会把晚间写成"昨天").
function localToday(): string
{
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

//* 质性文案 (按归一化类型): 只描述状态与照护建议, 不出现任何分值/等级/诊断词.
const WEATHER_COPY: Record<'SUNNY' | 'CLOUDY' | 'OVERCAST' | 'RAINY' | 'THUNDERSTORM' | 'FALLBACK', string> = {
    SUNNY: '情绪晴朗, 把此刻的状态留在这里.',
    CLOUDY: '有些云飘过, 平稳也算一种好天气.',
    OVERCAST: '天空偏阴, 允许自己慢一点.',
    RAINY: '情绪在下雨, 记得给自己撑把伞.',
    THUNDERSTORM: '心里有雷雨, 你已经撑了很久, 需要时随时可以求助.',
    FALLBACK: '天气平稳, 慢慢来就好.',
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

    const key = weatherIconKey(day.weatherType)
    const word = weatherWord(day.weatherType)
    const copy = WEATHER_COPY[weatherCopyKey(day.weatherType)]

    return (
        <div className="weather-capsule" ref={rootRef}>
            <button
                type="button"
                className="weather-chip"
                aria-expanded={open}
                aria-label={`今日情绪天气: ${word}`}
                onClick={() => setOpen(o => !o)}
            >
                <Icon name={key} size={16} />
                <span>{word}</span>
            </button>
            {open && (
                <div className="weather-pop">
                    <p className="weather-pop-title">今天的情绪天气</p>
                    <div className="weather-pop-main">
                        <Icon name={key} size={30} />
                        <div>
                            <p className="weather-pop-word">{word}</p>
                            <p className="weather-pop-copy">{copy}</p>
                        </div>
                    </div>
                    {day.entryCount > 0 && <p className="weather-pop-foot">由今天的 {day.entryCount} 条记录汇聚</p>}
                </div>
            )}
        </div>
    )
}
