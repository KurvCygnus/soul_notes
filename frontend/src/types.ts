//? 纯声明层: 字段逐项转写自后端 wire 契约 (kurvcygnus.soulnotes 的 DTO/VO), 键名与 JSON 序列化一致.
//? /context/summary 为后端 plan Task 6 预置契约, 前端 Task 12 联调时对齐.

//region 统一响应壳与认证

//* 后端 ApiResponse: 失败时 data 键整体缺席 (NON_NULL 序列化), 故 data 可选.
export type ApiResponse<T> = {
    code: number
    message: string
    data?: T | null
}

export type UserRole = 'STUDENT' | 'COUNSELOR'

//* POST /auth/login|register (免认证) 的成功负载, 即后端 AuthResponse.
export type AuthData = {
    token: string
    userId: string
    username: string
    role: UserRole
}

//endregion

//region 聊天

//* 会话列表条目 (GET /chat/sessions), 即后端 ChatSessionVo.
//* title: 首轮交换后 AI 生成; 存量会话为 null/缺席, 前端以 preview 兜底展示主行.
export type ChatSessionVo = {
    sessionId: string
    messageCount: number
    lastUpdateTime: string
    title?: string | null
    preview: string
}

export type ChatRole = 'user' | 'assistant'

//* POST /chat/send 的回复负载, 即后端 ChatMessageVo (timestamp 服务端生成).
export type ChatMessageVo = {
    role: ChatRole
    content: string
    timestamp: string
}

//* 前端统一消息形态: 流式路径无 timestamp, 故可选.
export type ChatMessage = {
    role: ChatRole
    content: string
    timestamp?: string
}

//* GET /chat/sessions/{id}/messages 条目; 存量消息 ts 为 null, 前端对 null 不做时间分组.
export type ChatHistoryMessage = {
    role: ChatRole
    content: string
    ts?: string | null
}

//endregion

//region 日记与情绪天气

//* POST /diaries 响应, 即后端 DiaryResponse (analysisResult 容错解析, 失败时为 null).
export type DiaryItem = {
    id: number
    userId: string
    content: string | null
    audioUrl: string | null
    analysisResult: AnalysisResult | null
    createdAt: string
}

//* 情感分析结果, 对应 analysisResult JSONB 的结构化映射.
export type AnalysisResult = {
    positive: number
    negative: number
    anxiety: number
    weather: string
    warningLevel: string
    summary?: string | null
}

//* weatherType 线上为枚举名字符串; 容忍对象形态 (如 {name:"SUNNY"}), 由消费方归一化.
export type WeatherTypeRaw = string | { name?: string }

//* GET /diaries/weather?start&end 条目, 即后端 EmotionWeatherVo.
export type WeatherDay = {
    date: string
    weatherType: WeatherTypeRaw
    positiveAvg: number
    negativeAvg: number
    anxietyAvg: number
    entryCount: number
}

//endregion

//region 语音

export type VoiceStatus = 'TRANSCRIBED' | 'FAILED'

//* POST /voice/upload 响应; FAILED 不抛 5xx, message 透传原因供降级文案 (离线安全网).
export type VoiceUploadResponse = {
    audioUrl: string
    fileId: string
    status: VoiceStatus
    transcribedText: string | null
    message: string | null
}

//endregion

//region 危机热线与校园上下文

//* GET /crisis/hotline (免认证, 离线安全网); appointmentUrl 空串表示机构未配置预约入口 (前端判空隐藏).
export type HotlineInfo = {
    name: string
    primary: string
    backup: string
    message: string
    appointmentUrl: string
}

export type ScheduleItem = { course: string; timeRange: string; location: string }
export type ExamItem = { name: string; date: string; daysUntil: number; location: string }
export type AgendaItem = { title: string; date: string; note: string }

export type ContextSummary = {
    schedule: ScheduleItem[]
    exams: ExamItem[]
    agenda: AgendaItem[]
}

//endregion

//region 每日总结

//* GET /summary/daily 与 /summary/recent 条目, 即后端 DailySummaryVo (date 为 LocalDate ISO 串, content 为质性文案).
export type DailySummaryVo = {
    date: string
    content: string
}

//endregion
