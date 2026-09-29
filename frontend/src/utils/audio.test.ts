//* encodeWav 纯函数测试: RIFF/WAVE 头 44 字节逐字段断言 + PCM16 编码 + 数据长度自洽.
//* jsdom 不具备 MediaRecorder/AudioContext, 录音链路无法单测 — 纯编码函数是上传质量 (后端仅收 16k
//* 单声道 PCM16 WAV) 的最后闸门, 字段级断言防回归. 断言按 WAV 规范偏移直接读字节, 不与实现共享代码.
import { describe, expect, it } from 'vitest'
import {
    encodeWav,
    MAX_RECORD_SECONDS,
    recordableSecondsLeft,
    WAV_HEADER_BYTES,
    WAV_SAMPLE_RATE,
} from './audio'

//* 小端读取器: WAV 规范全部为小端, getUXxx 第二参 true 与之一致.
function u16(bytes: ArrayBuffer, offset: number): number { return new DataView(bytes).getUint16(offset, true) }
function u32(bytes: ArrayBuffer, offset: number): number { return new DataView(bytes).getUint32(offset, true) }
function i16(bytes: ArrayBuffer, offset: number): number { return new DataView(bytes).getInt16(offset, true) }
function ascii(bytes: ArrayBuffer, offset: number, length: number): string
{
    return String.fromCharCode(...new Uint8Array(bytes, offset, length))
}

describe('encodeWav (RIFF/WAVE 头编码纯函数)', () =>
{
    it('头 44 字节: RIFF/WAVE/fmt /data 魔数齐备, 总长 = 44 + 2*样本数', () =>
    {
        const wav = encodeWav(new Float32Array(8), WAV_SAMPLE_RATE)
        expect(wav.byteLength).toBe(WAV_HEADER_BYTES + 16)
        expect(ascii(wav, 0, 4)).toBe('RIFF')
        expect(ascii(wav, 8, 4)).toBe('WAVE')
        expect(ascii(wav, 12, 4)).toBe('fmt ')
        expect(ascii(wav, 36, 4)).toBe('data')
    })

    it('fmt 字段: PCM(1) 单声道 16000Hz 16bit, byteRate/blockAlign 与规范自洽', () =>
    {
        const wav = encodeWav(new Float32Array(4), WAV_SAMPLE_RATE)
        expect(u32(wav, 16)).toBe(16)              //* fmt 块长 (PCM 固定 16)
        expect(u16(wav, 20)).toBe(1)               //* audioFormat = PCM
        expect(u16(wav, 22)).toBe(1)               //* 单声道
        expect(u32(wav, 24)).toBe(16000)           //* 采样率
        expect(u32(wav, 28)).toBe(16000 * 2)       //* byteRate = 采样率 * 声道 * 2字节
        expect(u16(wav, 32)).toBe(2)               //* blockAlign = 声道 * 2字节
        expect(u16(wav, 34)).toBe(16)              //* 位深
    })

    it('长度字段: RIFF 块长 = 36 + 数据长, data 块长 = 样本数 * 2', () =>
    {
        const wav = encodeWav(new Float32Array(100), WAV_SAMPLE_RATE)
        expect(u32(wav, 4)).toBe(36 + 200)
        expect(u32(wav, 40)).toBe(200)
    })

    it('PCM16 编码: 0/-1/+1 精确落位, 越界钳制, 正常值量化', () =>
    {
        const wav = encodeWav(new Float32Array([0, -1, 1, 0.5, 2, -2]), WAV_SAMPLE_RATE)
        expect(i16(wav, WAV_HEADER_BYTES)).toBe(0)  //* 首样本偏移 = 头长 (0 * 2 会被 lint 判 erasing-op, 故直接写偏移).
        expect(i16(wav, WAV_HEADER_BYTES + 1 * 2)).toBe(-32768)  //* -1.0 → int16 下界
        expect(i16(wav, WAV_HEADER_BYTES + 2 * 2)).toBe(32767)   //* +1.0 → int16 上界
        expect(i16(wav, WAV_HEADER_BYTES + 3 * 2)).toBe(16383)   //* 0.5 * 32767
        expect(i16(wav, WAV_HEADER_BYTES + 4 * 2)).toBe(32767)   //* 越界钳制到上界
        expect(i16(wav, WAV_HEADER_BYTES + 5 * 2)).toBe(-32768)  //* 越界钳制到下界
    })

    it('空样本: 只有头, data 长度为 0 (静音兜底不产生畸形文件)', () =>
    {
        const wav = encodeWav(new Float32Array(0), WAV_SAMPLE_RATE)
        expect(wav.byteLength).toBe(WAV_HEADER_BYTES)
        expect(u32(wav, 40)).toBe(0)
    })
})

describe('recordableSecondsLeft (按码率估算剩余可录秒数)', () =>
{
    it('未录时 = 60s 硬顶, 随已录时长递减, 不出现负数', () =>
    {
        expect(recordableSecondsLeft(0)).toBe(MAX_RECORD_SECONDS)
        expect(recordableSecondsLeft(30)).toBe(MAX_RECORD_SECONDS - 30)
        expect(recordableSecondsLeft(MAX_RECORD_SECONDS)).toBe(0)
        expect(recordableSecondsLeft(MAX_RECORD_SECONDS + 100)).toBe(0)
    })
})
