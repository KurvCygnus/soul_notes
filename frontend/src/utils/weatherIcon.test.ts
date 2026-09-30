//* weatherIcon/weatherWord 测试: 枚举名 -> 图标键与状态词的归一化契约 (后端 EmotionWeatherType 名单为准).
//* 评审裁决: UI 禁用 Unicode emoji — 归一化产出图标键 (交给 [[Icon]] 渲染 SVG), 不再产出字符.
import { describe, expect, it } from 'vitest'
import { weatherIconKey, weatherWord } from './weatherIcon'

describe('weatherIconKey (天气图标键归一化)', () =>
{
    it('枚举名映射图标键', () =>
    {
        expect(weatherIconKey('SUNNY')).toBe('sun')
        expect(weatherIconKey('CLOUDY')).toBe('cloud')
        expect(weatherIconKey('OVERCAST')).toBe('cloud')
        expect(weatherIconKey('RAINY')).toBe('rain')
        expect(weatherIconKey('THUNDERSTORM')).toBe('thunder')
    })

    it('未知与空缺回退仪表盘 (平稳语义)', () =>
    {
        expect(weatherIconKey('FOG')).toBe('gauge')
        expect(weatherIconKey('')).toBe('gauge')
        expect(weatherIconKey(null)).toBe('gauge')
        expect(weatherIconKey(undefined)).toBe('gauge')
    })

    it('对象形态与大小写/空白容忍', () =>
    {
        expect(weatherIconKey({ name: 'SUNNY' })).toBe('sun')
        expect(weatherIconKey({ name: 'thunderstorm' })).toBe('thunder')
        expect(weatherIconKey({ name: ' RAINY ' })).toBe('rain')
        expect(weatherIconKey({})).toBe('gauge')
    })
})

describe('weatherWord (天气状态词)', () =>
{
    it('枚举名映射中文状态词', () =>
    {
        expect(weatherWord('SUNNY')).toBe('晴')
        expect(weatherWord('CLOUDY')).toBe('多云')
        expect(weatherWord('OVERCAST')).toBe('阴')
        expect(weatherWord('RAINY')).toBe('雨')
        expect(weatherWord('THUNDERSTORM')).toBe('雷暴')
    })

    it('未知回退平稳 (非医疗化)', () =>
    {
        expect(weatherWord('FOG')).toBe('平稳')
        expect(weatherWord({ name: 'SUNNY' })).toBe('晴')
    })
})
