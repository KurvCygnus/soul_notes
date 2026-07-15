# Soul Notes 后端 — 当前状态与下一步规划

> **状态**: 第一期 (核心链路) 基本完成, 待进入第二期 (AI 接入).
> 本文档结合 `Early_Architecture.md` 分析实际架构差距, 规划后续任务.

---

## 1. 现状总览

### 1.1 已完成模块 (第一期)

| 模块              | 文件数   | 状态 | 备注 |
|-----------------|-------|------|------|
| `exception/`    | 7     | 完成 | `IBusinessException`, `HolderException`(sealed), `DataHolderException`, `ErrorCode`, `GlobalExceptionMapper`, `ValidationExceptionMapper` — 原 `BusinessException` 已删除 |
| `dto/`          | 2     | 完成 | `ApiResponse`, `PageRequest` |
| `utils/enums/`  | 3     | 完成 | `UserRole`, `EmotionWeatherType`, `WarningLevel` |
| `utils/`        | 3 + 1 | 完成 | `JsonUtils`, `PrintUtils`, `TimeUtils` + `lint/CallerSensitive` |
| `domain/auth/`  | 8     | 完成 | entity, dto, resource, service (x2), security (x2) |
| `domain/diary/` | 7     | 完成 | entity, dto (x4), resource, service (x3) |
| `domain/chat/`  | 6     | 完成 | entity, dto (x3), resource, service |

**单元测试**: 120 个, 全部通过.

### 1.2 最新修复记录

| 日期         | 修复内容                                               | 涉及文件 |
|------------|----------------------------------------------------|------|
| 2026-06-22 | PageRequest & DiaryListQuery 添加 page/size 边界 clamp | `PageRequest.java`, `DiaryListQuery.java`, 对应测试 |
| 2026-07-15 | 异常体系重构: BusinessException → IBusinessException + DataHolderException | `exception/` 包全部文件, 4 个 Service/Resource |
| 2026-07-15 | 实现 GlobalExceptionMapper + ValidationExceptionMapper | 新建 2 个 mapper |
| 2026-07-15 | 实现 TimeUtils, 更新 EmotionWeatherService 使用时区工具 | 新建 `TimeUtils.java` |
| 2026-07-15 | JWT 黑名单校验接入 JwtAuthenticationMechanism | `JwtAuthenticationMechanism.java` |
| 2026-07-15 | 修复 AiChatSession.subList FIX (防御性复制) | `AiChatSession.java` |
| 2026-07-15 | DiaryResource @RolesAllowed 使用 UserRole 常量 | `DiaryResource.java`, `UserRole.java` |
| 2026-07-15 | 补充 application.properties 完整配置 | `application.properties` |
| 2026-07-15 | 创建 SQL 表脚本 (6 文件) + init_schema.sql | `sql_scripts/` |

### 1.3 未实现模块 (第二/三/四期)

| 模块                     | 预期文件数 | 计划阶段 | 说明 |
|------------------------|-------|------|------|
| `config/`              | 4     | 一/二期 | `JwtConfig`, `CorsConfig`, `AiModelConfig`, `RedisConfig` — 配置目前分散在 application.properties 中 |
| `utils/constants/`     | 4     | 一期   | 常量类尚未抽取 |
| `ai/agent/`            | 3     | 二期   | `MoodAnalysisAgent`, `EmpatheticChatAgent`, `WarningDetectionAgent` |
| `ai/dto/`              | 2     | 二期   | `MoodAnalysisResult`, `WarningDetectionResult` |
| `ai/tool/`             | 2     | 二期   | `CrisisInterventionTool`, `UserContextTool` |
| `ai/retriever/`        | 1     | 四期   | `PsychologyTipsRetriever` |
| `domain/voice/`        | 5     | 三期   | resource, service (x2), dto (x2) |
| `websocket/`           | 2     | 三期   | `ChatWebSocket`, `AlertWebSocket` |

### 1.4 架构差异记录

Early_Architecture.md 与实际实现的偏差:

1. **AuthService 密码算法**: 架构文档规划 BCrypt, 实际实现为 SHA-256 (HMAC) — 因依赖限制选用轻量方案
2. **config/ 包缺失**: 架构文档设计 4 个配置类, 实际配置直接写在 application.properties 中 (JWT secret, Redis 等)
3. **utils/constants/ 未抽取**: 常量分散在各模块中
4. **异常体系重构**: 原 `BusinessException` 已删除, 替代为 `IBusinessException` 接口 + `HolderException`(sealed) + `DataHolderException` — 更好的封装性和调试标签
5. **异常映射器已实现**: `GlobalExceptionMapper` 和 `ValidationExceptionMapper` 已完成
6. **TimeUtils 已实现**: 统一时区工具已完成
7. **AI 层未开始**: 整个 `ai/` 包尚未实现 (agent, dto, tool, retriever)
8. **语音模块未开始**: `domain/voice/` 尚未实现
9. **WebSocket 未开始**: `ChatWebSocket` 和 `AlertWebSocket` 未实现
10. **ExampleResource**: Demo 端点, 非架构设计, 可保留用于冒烟测试
11. **PageRequest/DiaryListQuery 边界校验 (已修复)**: 原架构文档未关注边界校验, 已添加 page≥1/size≥1 clamp

---

## 2. 下一步任务

### 优先级 P0 (测试与基础设施完善) — 已完成 ✓

- [x] 补充 `application.properties` 完整配置项 (datasource, redis, jwt, cors)
- [x] 实现 `GlobalExceptionMapper` 和 `ValidationExceptionMapper` — 返回统一 JSON 错误响应
- [x] 实现 `utils/TimeUtils.java` — 统一时区工具
- [x] 异常体系重构: IBusinessException + DataHolderException + sealed HolderException
- [x] JWT 黑名单校验接入
- [x] SQL 表脚本 (users, mood_diaries, ai_chat_sessions)

### 优先级 P1 (AI 分析链路 — 第二期核心)

- [ ] 实现 `ai/agent/MoodAnalysisAgent.java` — 声明式 `@RegisterAiService` 接口
- [ ] 实现 `ai/agent/WarningDetectionAgent.java` — 预警检测
- [ ] 实现 `ai/dto/MoodAnalysisResult.java` 和 `ai/dto/WarningDetectionResult.java`
- [ ] 实现 `ai/tool/CrisisInterventionTool.java` — 红线干预热线工具
- [ ] 实现 `domain/diary/service/EmotionAnalysisService.java` 的 `analyzeAsync` 和 `analyzeAndDetect` 方法
- [ ] 实现 `domain/diary/service/EmotionWeatherService.java` 的 `aggregateByDay` 方法
- [ ] 补充 `/weather` 端点 (DiaryResource)

### 优先级 P2 (共情对话 + SSE — 第三期)

- [ ] 实现 `ai/agent/EmpatheticChatAgent.java`
- [ ] 实现 `ai/tool/UserContextTool.java`
- [ ] 实现 `ChatService.streamMessage()` 的 SSE 流式调用 `EmpatheticChatAgent`
- [ ] 实现 `websocket/ChatWebSocket.java` — WebSocket 流式文本推送
- [ ] 实现 `websocket/AlertWebSocket.java` — 红色预警推送

### 优先级 P3 (语音模块 — 第三期)

- [ ] 实现 `domain/voice/dto/VoiceUploadResponse.java` 和 `AsrCallbackRequest.java`
- [ ] 实现 `domain/voice/resource/VoiceResource.java`
- [ ] 实现 `domain/voice/service/VoiceStorageService.java` 和 `AsrTranscriptionService.java`

### 优先级 P4 (加固与优化 — 第四期)

- [ ] 实现 `ai/retriever/PsychologyTipsRetriever.java`
- [ ] 实现 `utils/constants/` 常量类抽取
- [ ] 实现 `config/` 配置类
- [ ] Redis 限流、缓存接入
- [ ] 离线安全兜底接口
- [ ] 集成测试 + 压力测试

---

## 3. 数据流关键链路

(不变, 略)

---

## 4. 测试覆盖规划

| 模块         |  当前   | 目标 | 策略 |
|------------|:-----:|------|------|
| DTO 类      | 28 测试 | 全覆盖 | 纯 POJO 测试, 无需 Mock |
| 工具类        | 19 测试 | 全覆盖 | 反射测试私有方法 |
| 异常类        | 23 测试 | 全覆盖 | 枚举 + 异常层次 + Mapper |
| 实体类        | 11 测试 | 全覆盖 | Panache 静态方法签名验证 |
| Service 层  | 19 测试 | 70%+ | 反射 + 集成测试 |
| Resource 层 | 1 测试  | 60%+ | `@QuarkusTest` + REST Assured |
| **总计**     |  120  | 200+ | |

---

## 5. 技术债务

- [x] `ChatService.getPreview()` 和 `countMessages()` 使用字符串切割解析 JSON — **已核实使用 JsonUtils**
- [x] `PageRequest` / `DiaryListQuery` 缺少 page/size 边界校验 — **已修复**
- [ ] `EmotionWeatherService.mapWeather()` 使用严格大于 `>` 而非 `>=`, 边界值行为需确认
- [x] `application.properties` 基本为空 — **已补充完整配置**
- [ ] `AuthService` 使用 SHA-256 而非 BCrypt, 生产环境应升级
- [ ] `AuthService.register()` 未对 password 做强度校验 (长度/复杂度)
- [x] `AiChatSession.getMessageList()` subList FIX — **已修复 (防御性复制)**
- [x] `DiaryListQueryTest` 包路径 — **已修复**
