# Soul Notes 后端 — 架构文档

## 1. 项目概述

Soul Notes 是一个面向大学生的多模态 AI 心理轻干预系统后端, 提供:

- **多模态输入**: 语音 (ASR 转录) 与文字, 统一进入 `Voice -> Text -> LLM 解析 -> 情感分析` 管线
- **情感分析与可视化**: 实时计算 positive / negative / anxiety 数值, 生成前端"情绪天气预报"数据
- **共情非医学化对话**: AI 以"心声树洞"倾听者角色回应, 禁止医学诊断标签
- **高危预警 (Red Alert)**: 检测到自伤/自杀倾向时, 在线推送弹窗 + 离线热线兜底

---

## 2. 技术栈

| 领域             | 技术                                                          |
|------------------|---------------------------------------------------------------|
| 运行时           | Java 21 (GraalVM), Quarkus 3.36                               |
| 持久化           | Hibernate Reactive + Panache, PostgreSQL (reactive-pg-client) |
| 缓存/限流/黑名单 | Redis (quarkus-redis-client)                                  |
| 实时通信         | quarkus-websockets-next (WS) + SSE                            |
| AI               | quarkus-langchain4j-openai (声明式 `@RegisterAiService`)      |
| 认证             | quarkus-smallrye-jwt (HS256 对称密钥)                         |
| JSON             | Jackson (JsonUtils 统一封装)                                  |

---

## 3. 包结构与模块职责

```text
kurvcygnus.soulnotes/
├── Entrance.java                      # Quarkus 应用入口
├── config/
│   └── RedisStartupConfig.java        # 启动时初始化 crisis:hotline, 提供响应式热线读取
├── exception/                         # 结构化异常体系
│   ├── IStructuredThrowable.java      # tag() + cause() 基础契约
│   ├── StructuredException.java       # 具体运行时异常默认实现
│   ├── IDetailedThrowable.java        # 携带类型化数据 (causeData / asException)
│   ├── ITransactionalThrowable.java   # 可回滚/可恢复异常
│   ├── IBusinessException.java        # 业务异常门面 (含包级私有 Holder/DataHolder 实现)
│   ├── ErrorCode.java                 # 统一错误码 (HTTP 状态 + 业务码)
│   └── GlobalExceptionMapper.java     # StructuredException -> 统一 JSON 响应
├── dto/
│   ├── ApiResponse.java               # 统一响应外壳 {code, message, data}
│   └── PageRequest.java               # 分页参数 (边界 clamp)
├── utils/
│   ├── constants/                     # JwtConstants, ApiEndpointConstants, RedisKeyConstants, AiPromptConstants
│   ├── enums/                         # UserRole, EmotionWeatherType, WarningLevel, VoiceStatus
│   ├── filter/
│   │   └── ChatRateLimitFilter.java   # 响应式 Redis 限流 (@ServerRequestFilter)
│   ├── lint/CallerSensitive.java      # 调用者敏感注解
│   ├── JsonUtils.java                 # Jackson 单例封装
│   ├── PrintUtils.java                # 日志/格式化 (quickFormat)
│   └── TimeUtils.java                 # Asia/Shanghai 时区工具
├── ai/
│   ├── agent/                         # @RegisterAiService 声明式接口
│   │   ├── MoodAnalysisAgent.java     # 情感分析
│   │   ├── WarningDetectionAgent.java # 预警检测 (NONE/YELLOW/RED)
│   │   └── EmpatheticChatAgent.java   # 共情对话 (chatSync + TokenStream)
│   ├── dto/
│   │   ├── MoodAnalysisResult.java    # positive/negative/anxiety/weather/summary
│   │   └── WarningDetectionResult.java# warningLevel/reason/suggestedAction
│   ├── tool/
│   │   ├── CrisisInterventionTool.java# RED 时返回热线信息
│   │   └── UserContextTool.java       # 近期情绪摘要 (数据库上下文工具)
│   └── retriever/
│       └── PsychologyTipsRetriever.java # 心理小知识内建知识库
├── domain/
│   ├── auth/
│   │   ├── entity/User.java
│   │   ├── dto/                       # LoginRequest / RegisterRequest / AuthResponse
│   │   ├── resource/AuthResource.java # /auth/register, /login, /logout
│   │   ├── service/                   # AuthService, TokenService
│   │   └── security/JwtAuthenticationMechanism.java
│   ├── diary/
│   │   ├── entity/MoodDiary.java      # JSONB analysis_result
│   │   ├── dto/                       # DiaryCreateRequest / DiaryListQuery / DiaryResponse / EmotionWeatherVo
│   │   ├── resource/DiaryResource.java# CRUD + /weather
│   │   └── service/                   # DiaryService, EmotionAnalysisService, EmotionWeatherService
│   ├── chat/
│   │   ├── entity/AiChatSession.java  # JSONB messages + truncate
│   │   ├── dto/                       # ChatSendRequest / ChatMessageVo / ChatSessionVo
│   │   ├── resource/ChatResource.java # /chat/send, /stream (SSE), /sessions
│   │   └── service/ChatService.java   # 对话编排 + 预警推送
│   ├── voice/
│   │   ├── dto/                       # VoiceUploadResponse / AsrCallbackRequest
│   │   ├── resource/VoiceResource.java# /upload, /files/{id}, /asr-callback
│   │   └── service/                   # VoiceStorageService, AsrTranscriptionService
│   └── crisis/
│       └── CrisisResource.java        # GET /crisis/hotline (离线兜底)
└── websocket/
    ├── WebSocketAuthUpgradeCheck.java # HttpUpgradeCheck JWT 认证网关
    ├── ChatWebSocket.java             # /ws/chat 流式文本推送
    └── AlertWebSocket.java            # /ws/alert RED 预警推送
```

> **说明**: 早期架构中的 `JwtConfig` / `CorsConfig` / `AiModelConfig` / `RedisConfig` 为无消费方的死代码,
> 已删除 (配置直接通过 `@ConfigProperty` / `application.properties` 注入). `ValidationExceptionMapper` 因未引入 Bean
> Validation 依赖而不存在, 参数校验由 `GlobalExceptionMapper` 兜底或业务层显式校验.

---

## 4. 认证与安全设计

### 4.1 JWT (HS256 对称密钥)

- 签发 (`TokenService.generateToken`): `Jwt.issuer("soul-notes").subject(userId).groups(role).jti(uuid)...signWithSecret(secret)`
  - **必须设置 `jti`**, 否则黑名单 (登出) 无法定位 token
  - **不设置 `upn`**: 资源层用 `getPrincipal().getName()` 解析 userId (即 `sub`, UUID), 若设 upn 会得到用户名导致 `UUID.fromString` 崩溃
- 验签 (`JwtAuthenticationMechanism` / `WebSocketAuthUpgradeCheck`): `jwtParser.verify(token, secret)`
  - 必须显式传入与签发一致的 secret, 否则依赖未配置的 `mp.jwt.verify.*` 公钥会失败
- **配置要求**:
  - `jwt.secret` (生产经 `HASH_KEY` 环境变量注入, ≥32 字节, 未配置时启动 fail-fast)
  - `mp.jwt.verify.issuer = soul-notes` — 必须与签发 issuer 一致, 否则 smallrye-jwt 用默认 `https://quarkus.io/issuer` 导致全部验签失败

### 4.2 黑名单登出

- 登出: `POST /auth/logout` -> `invalidateToken` -> `SETEX jwt:blacklist:{jti}` (TTL = token 剩余有效期)
- 校验: 每次认证查询 `isBlacklisted(jti)`, 命中则拒绝
- **jti 提取统一解析 payload 的 `jti` claim**, 与签发时写入的 jti 对齐

### 4.3 角色

- 注册仅允许 `STUDENT` 角色 (`RegisterRequest.role != STUDENT` 返回 400), 防提权
- 资源层用 `@RolesAllowed("STUDENT")`, 从 JWT `groups` 声明解析

### 4.4 密码

- 原型阶段使用 SHA-256 无盐哈希 (`AuthService.hashPassword`)
- **已知技术债**: 生产环境必须替换为 BCrypt; 已含长度/字符集/特殊字符复杂度校验

---

## 5. 响应式并发约束 (重要实现约定)

Quarkus + Hibernate Reactive 要求所有 DB 操作在**打开 Session 的 Vert.x 事件循环线程**上执行:

- 阻塞 AI 调用必须用 `vertx.executeBlocking(() -> blockingCall(), false)` — 在 worker 执行, 结果在事件循环回调
- **禁止** `Uni.item(supplier).runSubscriptionOn(worker)` 后直接做 DB 操作, 会触发 `HR000068/HR000069` (Session 跨线程)
- 查询型接口需要 `@WithTransaction` 才会打开 Session (如 `EmotionWeatherService.getWeatherData`)
- 流式/后台持久化通过 `Panache.withTransaction` 独立事务完成, 禁止 `await().indefinitely()` 于资源层
- Redis 操作用响应式 API (`ReactiveRedisDataSource`), 限流过滤器为 `@ServerRequestFilter` 返回 `Uni<Response>`, 全程无阻塞

---

## 6. AI 链路设计

| 场景             | Agent                                         | 模式                                                  |
|------------------|-----------------------------------------------|-------------------------------------------------------|
| 创建日记情感分析 | `MoodAnalysisAgent` + `WarningDetectionAgent` | 后台异步 (AI 失败自动降级)                            |
| 对话             | `EmpatheticChatAgent`                         | 同步 `chatSync` + SSE `TokenStream`                   |
| 预警检测         | `WarningDetectionAgent`                       | RED 时推 `AlertWebSocket` + 持久化 `warningTriggered` |

- 系统提示词集中在 `AiPromptConstants` (情感分析 / 预警检测 / 共情对话)
- 工具: `CrisisInterventionTool` (RED 热线), `UserContextTool` (近期情绪摘要)
- 心理小知识: `PsychologyTipsRetriever` 内建 13 条知识库
- 配置经 `quarkus.langchain4j.openai.*`; AI 不可用时走兜底 (聊天返回"走神"兜底文案, 日记跳过 analysisResult)

---

## 7. 语音链路

1. `POST /api/v1/voice/upload` (multipart) -> `VoiceStorageService.store` (worker 池文件 I/O) -> 返回 `{audioUrl, fileId, status}`
2. `GET /api/v1/voice/files/{fileId}` 流式返回文件 (fileId 经 UUID 校验防路径穿越)
3. `dispatchTranscription` 提交 ASR (当前为桩实现, 仅日志); 外部服务完成后回调 `POST /api/v1/voice/asr-callback` (`@PermitAll`)
4. 日记语音来源: `DiaryCreateRequest.audioData` (Base64) 解码 -> 落盘 -> 生成 `audioUrl`

---

## 8. WebSocket

- `WebSocketAuthUpgradeCheck`: 升级阶段校验 JWT (header 或 `token` 查询参数) + 黑名单, userId 存入 `UserData`
- `ChatWebSocket` (`/ws/chat`): 接收 JSON 消息, 订阅 `ChatService.streamMessage` 逐 token 推送
- `AlertWebSocket` (`/ws/alert`): RED 预警推送 `{type:"RED_ALERT", message, hotline}`

---

## 9. 数据流全景

```text
前端 (Vue)
├─ 日记 CRUD / 天气  ->  DiaryResource -> DiaryService / EmotionWeatherService -> PostgreSQL (analysis_result JSONB)
├─ AI 对话 (SSE/WS)  ->  ChatResource / ChatWebSocket -> ChatService -> EmpatheticChatAgent -> TokenStream
├─ 预警              ->  WarningDetectionAgent (RED) -> AlertWebSocket -> 前端弹窗 (热线)
├─ 离线兜底           ->  CrisisResource (/crisis/hotline) <- Redis crisis:hotline <- 静态默认值
└─ 语音              ->  VoiceResource -> VoiceStorageService / AsrTranscriptionService
```

---

## 10. 关键设计决策

1. **ID 策略**: `users.id` UUID (应用层生成), `mood_diaries.id` BigInt 自增, `ai_chat_sessions.id` UUID
2. **JSONB**: 存 Java `String`, 经 `JsonUtils` 序列化/反序列化; `analysis_result` 含 positive/negative/anxiety/weather/summary/warningLevel
3. **会话历史**: `AiChatSession.truncate(50)` 限制 JSONB 无限增长
4. **天气映射**: 阈值 (`weather.threshold.*`) 外置可配, 边界统一 `>=`
5. **异常体系**: `IBusinessException.of(ErrorCode, msg, factory, tag)`, tag 用 `WHERE_WHAT_ACTION`, 禁止 `ErrorCode.name()`
6. **离线安全兜底**: 三级 (离线端点 -> Redis 缓存 -> 静态默认值), 热线不硬编码于业务组件

---

## 11. 配置清单

`application.properties` 关键项:

| 项                             | 说明                                           |
|--------------------------------|------------------------------------------------|
| `jwt.secret` / `HASH_KEY`      | 签名密钥 (≥32 字节, 生产必配)                  |
| `mp.jwt.verify.issuer`         | 必须 = `soul-notes`                            |
| `quarkus.datasource.*`         | PostgreSQL, 账号经 `USER_NAME`/`USER_PASSWORD` |
| `quarkus.redis.hosts`          | Redis 地址                                     |
| `quarkus.langchain4j.openai.*` | AI 端点/模型/密钥 (`ai.openai.*` 占位)         |
| `crisis.hotline.*`             | 热线默认值                                     |
| `voice.storage.directory`      | 语音文件存储目录                               |
| `weather.threshold.*`          | 天气映射阈值                                   |

`application-dev.properties` (仅 dev profile): 本地 JWT 密钥 / DB 口令 / 均支持 `HASH_KEY`/`USER_NAME`/`USER_PASSWORD` 覆盖;
提交仓库时由 Git filter (`devsecrets`) 清洗本地密钥为占位符.

---

## 12. 测试覆盖

- 单元测试 ~172 个 (`./gradlew :test`), 覆盖: 异常体系 / 工具类 / DTO 边界 / Service 反射逻辑 / Resource 结构 / Agent 签名 / Retriever
- 集成链路经 WebFetch 全量验证: 注册/登录/登出+黑名单 / 角色提权拦截 / 日记 CRUD+天气 / 聊天(SSE+非流式) / 语音上传下载 / ASR 回调 / 限流(20次/分钟) / WebSocket 认证 / 404 错误映射

---

## 13. 已知边界与限制

- **AI 为占位实现**: `ai.openai.api-key=placeholder` 时所有 LLM 调用失败 -> 走降级; 真实接入后聊天/分析返回需配置有效密钥
- **密码 SHA-256** 待升级 BCrypt
- **SSE 流式持久化** (`streamAiReply` 完成回调) 依赖 AI 成功流; 当前桩实现不触发该路径, 真实 AI 下需关注回调线程的 Session 上下文
- **`UserContextTool`** 在无 Hibernate 上下文的工具线程执行时降级返回默认文案
- **`/voice/asr-callback`** 免认证, 生产需补充 API Key / IP 白名单
