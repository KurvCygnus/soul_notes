//* 日记域 API: 创建/情绪天气预报/语音上传 (语音转写结果回填日记与聊天输入, 同属多模态入口, 故同居此模块).
import { api } from './http'
import type { DiaryItem, VoiceUploadResponse, WeatherDay } from '../types'

//* 创建日记的请求负载: content 与 audioData (Base64) 至少一项, 由后端校验兜底.
export interface IDiaryPayload
{
    content?: string | null
    audioData?: string | null
}

export const createDiary = (payload: IDiaryPayload): Promise<DiaryItem> =>
    api<DiaryItem>('/api/v1/diaries', { method: 'POST', body: payload })

//* 情绪天气预报: query 键名与后端契约一致 (startDate/endDate, ISO yyyy-MM-dd, 含两端);
//* encodeURIComponent 防日期串中的意外字符破坏 query.
export const getWeather = (start: string, end: string): Promise<WeatherDay[]> =>
    api<WeatherDay[]>(`/api/v1/diaries/weather?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`)

//* 语音上传 (multipart): 字段名 `file` 由后端 @RestForm("file") 固定; FormData 交由 [[api]] 让浏览器生成 boundary.
export const uploadVoice = (file: Blob): Promise<VoiceUploadResponse> =>
{
    const form = new FormData()
    form.append('file', file)
    return api<VoiceUploadResponse>('/api/v1/voice/upload', { method: 'POST', body: form })
}
