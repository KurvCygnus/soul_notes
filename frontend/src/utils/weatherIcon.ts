//* 天气图标归一化: 后端 EmotionWeatherType 枚举名 (或防御性对象形态) -> 图标键 + 中文状态词.
//* 评审裁决: UI 禁用 Unicode emoji — 符号展示改由 [[Icon]] 组件按图标键渲染 SVG, 本模块不再产出字符.
import type { IconName } from '../components/ui/Icon'
import type { WeatherTypeRaw } from '../types'

//* 归一化: 容忍枚举名字符串 / {name} 对象 / 空缺, 统一为大写键 (后端 weatherType 存在对象形态的防御性容忍).
function normalizeWeatherType(t: WeatherTypeRaw | null | undefined): string
{
    if(t == null)
        return ''
    if(typeof t === 'string')
        return t.trim().toUpperCase()
    const name = (t as { name?: unknown }).name
    return typeof name === 'string' ? name.trim().toUpperCase() : ''
}

//* 枚举名 -> 图标键 (交给 [[Icon]] 渲染 SVG); 未知类型回退仪表盘 (平稳语义, 非医疗化表述).
export function weatherIconKey(t: WeatherTypeRaw | null | undefined): Extract<IconName, 'sun' | 'cloud' | 'rain' | 'thunder' | 'gauge'>
{
    switch(normalizeWeatherType(t))
    {
        case 'SUNNY': return 'sun'
        case 'CLOUDY': return 'cloud'
        case 'OVERCAST': return 'cloud'
        case 'RAINY': return 'rain'
        case 'THUNDERSTORM': return 'thunder'
        default: return 'gauge'
    }
}

//* 枚举名 -> 质性文案键 (popover 文案表; 未知/空缺回退 FALLBACK — 平稳语义, 非医疗化表述).
export type WeatherCopyKey = 'SUNNY' | 'CLOUDY' | 'OVERCAST' | 'RAINY' | 'THUNDERSTORM' | 'FALLBACK'
export function weatherCopyKey(t: WeatherTypeRaw | null | undefined): WeatherCopyKey
{
    switch(normalizeWeatherType(t))
    {
        case 'SUNNY': return 'SUNNY'
        case 'CLOUDY': return 'CLOUDY'
        case 'OVERCAST': return 'OVERCAST'
        case 'RAINY': return 'RAINY'
        case 'THUNDERSTORM': return 'THUNDERSTORM'
        default: return 'FALLBACK'
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
