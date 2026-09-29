//* 情绪天气的类型归一化: 后端 Jackson 默认把 EmotionWeatherType 序列化为枚举名字符串 (如 "SUNNY"),
//* 但部分历史/兜底序列化路径可能出现对象形态 (如 {name:"SUNNY"}), 消费方必须两种都容忍且永不抛错
//* (天气胶囊与情境卡同属 fail-silent 展示件, 归一化失败一律回退默认形态, 不打断页面).
import type { WeatherTypeRaw } from '../types'

//* 归一化为大写枚举名: 字符串去空白转大写; 对象形态取 name 字段; 其余 (null/缺字段) 返回 null.
function normalizeWeatherType(t: WeatherTypeRaw | null | undefined): string | null
{
    const raw = typeof t === 'string' ? t : t?.name
    if(typeof raw !== 'string')
        return null
    const name = raw.trim().toUpperCase()
    return name === '' ? null : name
}

//* 天气符号: 四种已知类型映射 emoji, 未知/其它一律回退 🌡️ (含后端 OVERCAST — 符号表按任务契约只认四种,
//* 状态词见 [[weatherWord]], 二者独立回退互不影响).
export function weatherGlyph(t: WeatherTypeRaw | null | undefined): string
{
    switch(normalizeWeatherType(t))
    {
        case 'SUNNY': return '☀️'
        case 'CLOUDY': return '☁️'
        case 'RAINY': return '🌧️'
        case 'THUNDERSTORM': return '⛈️'
        default: return '🌡️'
    }
}

//* 状态词与后端 EmotionWeatherType 的中文标签一致 (含 OVERCAST), 未知类型回退"平稳" (非医疗化表述).
export function weatherWord(t: WeatherTypeRaw | null | undefined): string
{
    switch(normalizeWeatherType(t))
    {
        case 'SUNNY': return '晴'
        case 'CLOUDY': return '多云'
        case 'OVERCAST': return '阴'
        case 'RAINY': return '雨'
        case 'THUNDERSTORM': return '雷暴'
        default: return '平稳'
    }
}
