//* weatherGlyph/weatherWord 测试: 枚举名 -> 符号与状态词的归一化契约 (后端 EmotionWeatherType 名单为准).
//* 后端 Jackson 默认按枚举名序列化 (wire 为 "SUNNY" 等字符串), 但历史数据可能出现对象形态 ({name}), 两种都要容忍.
import { describe, expect, it } from 'vitest'
import { weatherGlyph, weatherWord } from './weatherGlyph'

describe('weatherGlyph (天气符号归一化)', () =>
{
    it('四种已知枚举名映射为对应符号', () =>
    {
        expect(weatherGlyph('SUNNY')).toBe('☀️')
        expect(weatherGlyph('CLOUDY')).toBe('☁️')
        expect(weatherGlyph('RAINY')).toBe('🌧️')
        expect(weatherGlyph('THUNDERSTORM')).toBe('⛈️')
    })

    it('未知枚举/空串/非字符串回退 🌡️ (fail-silent, 不抛错)', () =>
    {
        expect(weatherGlyph('FOG')).toBe('🌡️')
        expect(weatherGlyph('')).toBe('🌡️')
        expect(weatherGlyph(null)).toBe('🌡️')
        expect(weatherGlyph(undefined)).toBe('🌡️')
    })

    it('对象形态 ({name}) 与大小写/空白差异同样容忍', () =>
    {
        expect(weatherGlyph({ name: 'SUNNY' })).toBe('☀️')
        expect(weatherGlyph({ name: 'thunderstorm' })).toBe('⛈️')
        expect(weatherGlyph({ name: ' RAINY ' })).toBe('🌧️')
        expect(weatherGlyph({})).toBe('🌡️')
    })
})

describe('weatherWord (天气状态词)', () =>
{
    it('已知枚举映射为中文状态词 (与后端 EmotionWeatherType 标签一致)', () =>
    {
        expect(weatherWord('SUNNY')).toBe('晴')
        expect(weatherWord('CLOUDY')).toBe('多云')
        expect(weatherWord('OVERCAST')).toBe('阴')
        expect(weatherWord('RAINY')).toBe('雨')
        expect(weatherWord('THUNDERSTORM')).toBe('雷暴')
    })

    it('未知/对象形态回退平稳词, 不抛错', () =>
    {
        expect(weatherWord('FOG')).toBe('平稳')
        expect(weatherWord({ name: 'SUNNY' })).toBe('晴')
        expect(weatherWord(null)).toBe('平稳')
        expect(weatherWord(undefined)).toBe('平稳')
    })
})
