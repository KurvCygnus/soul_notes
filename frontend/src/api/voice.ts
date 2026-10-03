//* 日记域 API (homepage-v2 Task 9 收敛): 仅余语音上传 — 语音转写结果回填聊天输入, 多模态入口的文本侧起点.
//* createDiary/getWeather 已移除 (D16 记一笔移除 + D14 天气 UI 废除): 后端端点原样保留, 前端不再消费.
import { api } from './http'
import type { VoiceUploadResponse } from '../types'

//* 语音上传 (multipart): 字段名 `file` 由后端 @RestForm("file") 固定; FormData 交由 [[api]] 让浏览器生成 boundary.
export const uploadVoice = (file: Blob): Promise<VoiceUploadResponse> =>
{
    const form = new FormData()
    form.append('file', file)
    return api<VoiceUploadResponse>('/api/v1/voice/upload', { method: 'POST', body: form })
}
