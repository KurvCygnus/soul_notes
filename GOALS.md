# Soul Notes 后端 — 当前状态与下一步规划

> **状态**: 第一期 (核心链路) 已完成, 第二期 (AI 分析链路) 核心代码已完成.
> 本文档结合 `Early_Architecture.md` 分析实际架构差距, 规划后续任务.

---

## 1. 现状总览

### 1.1 已完成模块 (第一期)

| 模块              | 文件数   | 状态 | 备注                                                                                                                                                                    |
|-----------------|-------|----|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `exception/`    | 7     | 完成 | `IBusinessException`, `HolderException`(sealed), `DataHolderException`, `ErrorCode`, `GlobalExceptionMapper`, `ValidationExceptionMapper` — 原 `BusinessException` 已删除 |
| `dto/`          | 2     | 完成 | `ApiResponse`, `PageRequest`                                                                                                                                          |
| `utils/enums/`  | 3     | 完成 | `UserRole`, `EmotionWeatherType`, `WarningLevel`                                                                                                                      |
| `utils/`        | 3 + 1 | 完成 | `JsonUtils`, `PrintUtils`, `TimeUtils` + `lint/CallerSensitive`                                                                                                       |
| `domain/auth/`  | 8     | 完成 | entity, dto, resource, service (x2), security (x2)                                                                                                                    |
| `domain/diary/` | 7     | 完成 | entity, dto (x4), resource, service (x3)                                                                                                                              |
| `domain/chat/`  | 6     | 完成 | entity, dto (x3), resource, service                                                                                                                                   |

**单元测试**: ~135 个, 全部通过.

### 1.2 最新修复记录

| 日期             | 修复内容                                                                                     | 涉及文件                                                                   |
|----------------|------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| 2026-07-17     | 修复 AI 分析结果持久化缺口: analyzeAsync/analyzeAndDetect 追加 `persistAndFlush()` 链                  | `EmotionAnalysisService.java`                                          |
| 2026-07-17     | 修复 WarningDetectionAgent `@RegisterAiService` 包名                                         | `WarningDetectionAgent.java`                                           |
| 2026-07-17     | 新增 AI 模块单元测试: AiDtoTest, EmotionAnalysisServiceTest, CrisisInterventionToolTest          | `ai/dto/`, `domain/diary/service/`, `ai/tool/`                         |
| 2026-06-22     | PageRequest & DiaryListQuery 添加 page/size 边界 clamp                                       | `PageRequest.java`, `DiaryListQuery.java`, 对应测试                        |
| 2026-07-15     | 异常体系重构: BusinessException → IBusinessException + DataHolderException                     | `exception/` 包全部文件, 4 个 Service/Resource                               |
| 2026-07-15     | 实现 GlobalExceptionMapper + ValidationExceptionMapper                                     | 新建 2 个 mapper                                                          |
| 2026-07-15     | 实现 TimeUtils, 更新 EmotionWeatherService 使用时区工具                                            | 新建 `TimeUtils.java`                                                    |
| 2026-07-15     | JWT 黑名单校验接入 JwtAuthenticationMechanism                                                   | `JwtAuthenticationMechanism.java`                                      |
| 2026-07-15     | 修复 AiChatSession.subList FIX (防御性复制)                                                     | `AiChatSession.java`                                                   |
| 2026-07-15     | DiaryResource @RolesAllowed 使用 UserRole 常量                                               | `DiaryResource.java`, `UserRole.java`                                  |
| 2026-07-15     | Tag 策略细化: 删除旧 `IBusinessException.of(ErrorCode)` 工厂方法, 改用 `WHERE_WHAT_ACTION` 格式, 精确异常工厂 | `IBusinessException.java` + 全部调用点 + 测试                                 |
| 2026-07-15     | 补充 application.properties 完整配置                                                           | `application.properties`                                               |
| 2026-07-16     | 抽取 `utils/constants/` 包 (4 常量类) + `config/` 包 (4 配置类)                                    | 新建 8 文件 + 更新 5 文件 + 4 测试                                               |
| 2026-07-15     | 创建 SQL 表脚本 (6 文件) + init_schema.sql                                                      | `sql_scripts/`                                                         |
| **2026-07-18** | **修复 ChatResource.stream() null sessionId 导致崩溃**                                         | `ChatResource.java`, `ChatService.java`                                |
| **2026-07-18** | **禁用 AI 请求/响应日志 (生产安全)**                                                                 | `application.properties`                                               |
| **2026-07-18** | **所有空 catch 块添加 warn 日志**                                                                | `EmotionWeatherService.java`, `DiaryResponse.java`, `ChatService.java` |
| **2026-07-18** | **添加 DiaryCreateRequest 空内容校验**                                                          | `DiaryService.java`                                                    |
| **2026-07-18** | **移除 ExampleResource Demo 端点**                                                           | 删除 `ExampleResource.java`, `ExampleResourceTest.java`                  |
| **2026-07-18** | **更新 AiChatSession 过时注释, CrisisInterventionTool 添加 @SuppressWarnings**                   | `AiChatSession.java`, `CrisisInterventionTool.java`                    |

### 1.3 未实现模块 (第三/四期)

| 模块                 | 预期文件数 | 计划阶段 | 说明                                                                                           |
|--------------------|-------|------|----------------------------------------------------------------------------------------------|
| `ai/retriever/`    | 1     | 四期   | `PsychologyTipsRetriever`                                                                    |
| `domain/voice/`    | 5     | 三期   | resource, service (x2), dto (x2)                                                             |
| `websocket/`       | 2     | 三期   | `ChatWebSocket`, `AlertWebSocket`                                                            |

### 1.4 已实现模块 (P1 AI 分析链路)

| 模块                              | 文件数 | 状态 | 说明                                                                                                 |
|---------------------------------|-----|----|----------------------------------------------------------------------------------------------------|
| `ai/agent/`                     | 2   | 完成 | `MoodAnalysisAgent`, `WarningDetectionAgent` — 声明式 `@RegisterAiService` 接口, 引用 `AiPromptConstants` |
| `ai/dto/`                       | 2   | 完成 | `MoodAnalysisResult`, `WarningDetectionResult` — Record 实现                                         |
| `ai/tool/`                      | 1   | 完成 | `CrisisInterventionTool` — `@Tool` 热线工具                                                            |
| `domain/diary/service/Analysis` | 2   | 完成 | `EmotionAnalysisService` (analyzeAsync + analyzeAndDetect), `EmotionWeatherService` (聚合+天气映射)      |

### 1.5 架构差异记录

Early_Architecture.md 与实际实现的偏差:

1. **AuthService 密码算法**: 架构文档规划 BCrypt, 实际实现为 SHA-256 (HMAC) — 因依赖限制选用轻量方案
2. **config/ 包已实现**: 架构文档设计 4 个配置类, 已创建 `JwtConfig`, `CorsConfig`, `AiModelConfig`, `RedisConfig` (2026-07-16)
3. **utils/constants/ 已抽取**: 常量已集中到 4 个常量类 — `JwtConstants`, `RedisKeyConstants`, `ApiEndpointConstants`, `AiPromptConstants` (2026-07-16)
4. **异常体系重构**: 原 `BusinessException` 已删除, 替代为 `IBusinessException` 接口 + `HolderException`(final) + `DataHolderException` — 更好的封装性和调试标签。Tag 采用 `WHERE_WHAT_ACTION` 格式（如 `"AUTH_LOGIN_USER_NOT_FOUND"`），禁止 `ErrorCode.name()`。
5. **异常映射器已实现**: `GlobalExceptionMapper` 和 `ValidationExceptionMapper` 已完成
6. **TimeUtils 已实现**: 统一时区工具已完成
7. **AI 层已完成 P1 核心**: `ai/agent/`, `ai/dto/`, `ai/tool/` 核心文件已实现, `EmotionAnalysisService` 持久化缺口已修复。`EmpatheticChatAgent`(P2) 和 `UserContextTool`(P2) 待实现
8. **MoodAnalysisResult / WarningDetectionResult 使用 Record**: 架构文档设计为 class, 实际实现为 Java Record (不可变, 更简洁)
9. **WarningDetectionAgent `@RegisterAiService` 包名**: 使用 `io.quarkiverse.langchain4j.RegisterAiService` 而非 `dev.langchain4j.service.RegisterAiService`
10. **Mutiny 3.x API 差异**: `recoverWithItem(T)` 在 `UniOnFailure<T, E>` 上而非 `Uni<T>`, 需要二次 `.onFailure()` 链式调用
11. **语音模块未开始**: `domain/voice/` 尚未实现
12. **WebSocket 未开始**: `ChatWebSocket` 和 `AlertWebSocket` 未实现
13. **ExampleResource**: Demo 端点, 非架构设计, **已于 2026-07-18 移除**
14. **PageRequest/DiaryListQuery 边界校验 (已修复)**: 原架构文档未关注边界校验, 已添加 page≥1/size≥1 clamp

---

## 2. 下一步任务

### 优先级 P0 (测试与基础设施完善) — 已完成 ✓

- [x] 补充 `application.properties` 完整配置项 (datasource, redis, jwt, cors)
- [x] 实现 `GlobalExceptionMapper` 和 `ValidationExceptionMapper` — 返回统一 JSON 错误响应
- [x] 实现 `utils/TimeUtils.java` — 统一时区工具
- [x] 异常体系重构: IBusinessException + DataHolderException + sealed HolderException
- [x] JWT 黑名单校验接入
- [x] SQL 表脚本 (users, mood_diaries, ai_chat_sessions)

### 优先级 P1 (AI 分析链路 — 第二期核心) — 已完成 ✓

- [x] 实现 `ai/agent/MoodAnalysisAgent.java` — 声明式 `@RegisterAiService` 接口
- [x] 实现 `ai/agent/WarningDetectionAgent.java` — 预警检测
- [x] 实现 `ai/dto/MoodAnalysisResult.java` 和 `ai/dto/WarningDetectionResult.java`
- [x] 实现 `ai/tool/CrisisInterventionTool.java` — 红线干预热线工具
- [x] 实现 `domain/diary/service/EmotionAnalysisService.java` 的 `analyzeAsync` 和 `analyzeAndDetect` 方法
- [x] 实现 `domain/diary/service/EmotionWeatherService.java` 的 `aggregateByDay` 方法
- [x] 补充 `/weather` 端点 (DiaryResource)
- [x] 修复 AI 分析结果持久化缺口 (analyzeAsync/analyzeAndDetect 未调用 persistAndFlush)
- [x] 新增 AI 模块单元测试 (AiDtoTest, EmotionAnalysisServiceTest, CrisisInterventionToolTest)

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
- [x] 实现 `utils/constants/` 常量类抽取 ✓
- [x] 实现 `config/` 配置类 ✓
- [ ] Redis 限流、缓存接入
- [ ] 离线安全兜底接口
- [ ] 集成测试 + 压力测试

---

## 3. 数据流关键链路

(不变, 略)

---

## 4. 测试覆盖规划

| 模块         |  当前   | 目标   | 策略                            |
|------------|:-----:|------|-------------------------------|
| DTO 类      | 30 测试 | 全覆盖  | 纯 POJO 测试, 无需 Mock            |
| 工具类        | 19 测试 | 全覆盖  | 反射测试私有方法                      |
| 异常类        | 23 测试 | 全覆盖  | 枚举 + 异常层次 + Mapper            |
| 实体类        | 11 测试 | 全覆盖  | Panache 静态方法签名验证              |
| Service 层  | 24 测试 | 70%+ | 反射 + 集成测试                     |
| Resource 层 | 1 测试  | 60%+ | `@QuarkusTest` + REST Assured |
| AI 工具类     | 2 测试  | 全覆盖  | 纯 POJO 测试                     |
| **总计**     | ~135  | 200+ |                               |

---

## 5. 技术债务

### 已修复 (本次清理)

- [x] `ChatResource.stream()` null sessionId 传递 `""` 导致 `UUID.fromString("")` 崩溃 — **已修复: 传递 null 并处理**
- [x] `application.properties` AI 请求/响应日志全开 (`log-requests=true`) — **已禁用 (生产安全)**
- [x] `EmotionWeatherService.java`, `DiaryResponse.java`, `ChatService.java` 空 catch 吞没异常 — **已添加 warn 日志**
- [x] `DiaryCreateRequest` 无运行时校验, content 和 audioData 可同时为 null — **已添加 BAD_REQUEST 校验**
- [x] `ExampleResource.java` TODO 未清理 — **已移除 Demo 端点**
- [x] `AiChatSession.java` Phase 2 注释已过时 — **已更新**

### 已知遗留

- [ ] `EmotionWeatherService.mapWeather()` 使用严格大于 `>` 而非 `>=`, 边界值行为需确认
- [ ] `AuthService` 使用 SHA-256 而非 BCrypt, 生产环境应升级 (需引入 jbcrypt / spring-security-crypto 依赖)
- [ ] `AuthService.register()` 未对 password 做强度校验 (长度/复杂度)
- [ ] `CrisisInterventionTool` 热线为静态硬编码, 应从 Redis (`crisis:hotline`) 加载 (Phase 4)
- [ ] `EmotionWeatherService` 天气阈值 (0.8/0.6/0.4) 硬编码, 同理心映射规则待细化
- [ ] `application.properties` JWT 密钥 fallback 为硬编码明文 (需确保生产环境配置 `HASH_KEY` 环境变量)
- [ ] Bean依赖关系 **不清晰**:
   1. `kurvcygnus.soulnotes.domain.auth.service.TokenService.java:45`: *未满足的依赖关系(`@NotNull ReactiveRedisDataSource redisDS`): 没有 Bean 与注入点相匹配*
   2. `kurvcygnus.soulnotes.domain.diary.service.EmotionAnalysisService:37`: *未满足的依赖关系(`@NotNull MoodAnalysisAgent moodAnalysisAgent`): 没有 Bean 与注入点相匹配*
   3. `kurvcygnus.soulnotes.domain.diary.service.EmotionAnalysisService:38`: *未满足的依赖关系(`@NotNull WarningDetectionAgent warningDetectionAgent`): 没有 Bean 与注入点相匹配*\
   **这些都意味着注入会直接失败. 应当尽快修复.**
- [ ] [init_schema](init_schema.sql) 为空. 该脚本应当调用 [该目录下的所有SQL表脚本](./sql_scripts).

### 早期已修复

- [x] `ChatService.getPreview()` 和 `countMessages()` 使用字符串切割解析 JSON — **已核实使用 JsonUtils**
- [x] `PageRequest` / `DiaryListQuery` 缺少 page/size 边界校验 — **已修复**
- [x] `application.properties` 基本为空 — **已补充完整配置**
- [x] `AiChatSession.getMessageList()` subList FIX — **已修复 (防御性复制)**
- [x] `DiaryListQueryTest` 包路径 — **已修复**

### 测试覆盖缺口 (不含未实现模块)

| 包                    | 缺失测试文件                                                                                         | 说明            |
|----------------------|------------------------------------------------------------------------------------------------|---------------|
| `config/`            | `JwtConfig`, `CorsConfig`, `RedisConfig`, `AiModelConfig`                                      | 4 配置类全无测试     |
| `ai/agent/`          | `MoodAnalysisAgent`, `WarningDetectionAgent`                                                   | Agent 接口签名验证  |
| `exception/`         | `IDetailedThrowable`, `IStructuredThrowable`, `ITransactionalThrowable`, `StructuredException` | 异常接口与实现       |
| `domain/*/resource/` | `AuthResource`, `ChatResource`, `DiaryResource`                                                | 3 REST 资源全无测试 |
| `domain/*/service/`  | `TokenService`, `ChatService`, `DiaryService`                                                  | 复杂业务逻辑        |
| `utils/lint/`        | `CallerSensitive`                                                                              | 注解验证          |
| `dto/`               | `ApiResponse`                                                                                  | 共享 DTO        |
