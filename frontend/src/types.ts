//? 纯声明层: 字段逐项转写自后端 wire 契约 (kurvcygnus.soulnotes 的 DTO/VO), 键名与 JSON 序列化一致.
//? 数据扩展条目经 POST /api/v1/ext/{name}/query 取回 (T5 REST), D 按 Jackson 序列化对齐 domain/extension 的 DomainItems.

//region 统一响应壳与认证

//* 后端 ApiResponse: 失败时 data 键整体缺席 (NON_NULL 序列化), 故 data 可选.
export type ApiResponse<T> = {
    code: number
    message: string
    data?: T | null
}

//* POST /auth/login|register (免认证) 的成功负载, 即后端 AuthResponse.
//* role: STUDENT/COUNSELOR/ADMIN (后端 UserRole 全量; 注册端固定发 STUDENT, 咨询员/管理员账号由管理侧开通).
export type UserRole = 'STUDENT' | 'COUNSELOR' | 'ADMIN'

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
//* pinnedAt: 置顶时间戳 (Task 6/8); null/缺席 = 未置顶, 前端据此分组 ("置顶"节在前).
export type ChatSessionVo = {
    sessionId: string
    messageCount: number
    lastUpdateTime: string
    title?: string | null
    preview: string
    pinnedAt?: string | null
}

export type ChatRole = 'user' | 'assistant'

//* POST /chat/send 的回复负载, 即后端 ChatMessageVo (timestamp 服务端生成;
//* sessionId = 实际写入的会话 ID, 与流式 meta 事件对齐 — 降级路径据此绑定会话).
//* followups: 候选追问 (Task 7/8); send 响应恒为空数组 (追问异步生成, 经 SSE 尾随事件与历史回放到达).
export type ChatMessageVo = {
    role: ChatRole
    content: string
    timestamp: string
    sessionId: string | null
    followups?: string[]
}

//* 前端统一消息形态: 流式路径无 timestamp, 故可选.
export type ChatMessage = {
    role: ChatRole
    content: string
    timestamp?: string
}

//* GET /chat/sessions/{id}/messages 条目; 存量消息 ts 为 null, 前端对 null 不做时间分组.
//* followups: 候选追问 (Task 7/8), AI 消息专属; 存量消息/用户消息为空数组或缺席, 读取端容错.
export type ChatHistoryMessage = {
    role: ChatRole
    content: string
    ts?: string | null
    followups?: string[]
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

//region 危机热线与数据扩展

//* GET /crisis/hotline (免认证, 离线安全网); appointmentUrl 空串表示机构未配置预约入口 (前端判空隐藏).
export type HotlineInfo = {
    name: string
    primary: string
    backup: string
    message: string
    appointmentUrl: string
}

//* 数据扩展三条目 (POST /api/v1/ext/{name}/query), 即后端 DomainItems 嵌套 record:
//* name = timetable → ScheduleItem[], exams → ExamItem[], agenda → AgendaItem[].
//* date 均为 LocalDate 的 ISO 日串 (如 "2026-10-08"); daysUntil 是取数日基准的展示不变量 ("N 天后").
export type ScheduleItem = { course: string; timeRange: string; location: string }
export type ExamItem = { name: string; date: string; daysUntil: number; location: string }
//* note 可 null (后端 Nullable + NON_NULL 序列化下还会整体缺席), 消费端不得假定可直插模板串.
export type AgendaItem = { title: string; date: string; note: string | null }

//endregion

//region 每日总结

//* GET /summary/daily 与 /summary/recent 条目, 即后端 DailySummaryVo (date 为 LocalDate ISO 串, content 为质性文案).
export type DailySummaryVo = {
    date: string
    content: string
}

//endregion

//region 对话风格偏好 (设置)

//* GET/PUT /me/chat-style 的 style 值域, 后端提示词按档位路由倾听者人格.
export type ChatStyleName = 'default' | 'professional' | 'friendly' | 'direct' | 'optimist' | 'pragmatic' | 'witty'

//* 语气四轴三档: less/default/more = 减弱/默认/增强.
export type ChatStyleTrio = 'less' | 'default' | 'more'

//* GET/PUT /api/v1/me/chat-style 的请求/响应体, 即后端 ChatStylePrefs: style 决定人格档,
//* warmth/enthusiasm/headings/emoji 为微调轴 — 只影响倾听者回复的措辞与格式, 不触及安全守护链路.
export type ChatStyleVo = {
    style: ChatStyleName
    warmth: ChatStyleTrio
    enthusiasm: ChatStyleTrio
    headings: ChatStyleTrio
    emoji: ChatStyleTrio
}

//endregion

//region 咨询员工作台

//* 风险等级值域: ClinicalResource 白名单 (非白名单直接 400).
export type RiskLevel = 'YELLOW' | 'RED'

//* GET /api/v1/clinical/assessments (风险队列) 与 /api/v1/clinical/students/{userId}/assessments (学生时间线)
//* 条目, 即后端 AssessmentVo. userId: 实名解锁为完整 UUID, 否则 8 位脱敏短码 — 时间线端点只收 UUID (短码 400),
//* 前端消费侧须对短码行降级. tags: canonical 结构化载荷透传 (实测形如 { tags: string[], summary, riskLevel }),
//* NON_NULL 序列化下可能整体缺席. 聊天正文永不暴露 (Spec §6 伦理红线), 摘要是 canonical 摘要而非原文.
export type AssessmentVo = {
    id: string
    userId: string
    displayName: string
    riskLevel: string
    summary: string
    tags?: { tags?: string[] } | null
    sessionId: string
    createdAt: string
}

//* GET /api/v1/clinical/stats/summary, 即后端 StatsSummary: byLevel 仅含出现的等级, byDay 按日升序
//* (date 为 ISO 日串; 存在服务端时钟偏移导致的未来日期, 取数端按"本地日历日命中即算"消费, 未命中记 0).
export type StatsSummary = {
    byLevel: Record<string, number>
    byDay: { date: string; yellow: number; red: number }[]
    totalStudents: number
}

//endregion
