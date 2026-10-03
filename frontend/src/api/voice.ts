//* 语音域 API: 语音上传 — 转写结果回填聊天输入, 多模态入口的文本侧起点.
//* (原日记域 API 收敛于此并随日记域砍除更名 voice.ts, 走查裁决 2026-10-03; createDiary/getWeather 已移除.)
import { api } from './http'
import type { VoiceUploadResponse } from '../types'

//* 语音上传 (multipart): 字段名 `file` 由后端 @RestForm("file") 固定; FormData 交由 [[api]] 让浏览器生成 boundary.
export const uploadVoice = (file: Blob): Promise<VoiceUploadResponse> =>
{
    const form = new FormData()
    form.append('file', file)
    return api<VoiceUploadResponse>('/api/v1/voice/upload', { method: 'POST', body: form })
}
