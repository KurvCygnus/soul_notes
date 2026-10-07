package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.service.TokenStream;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import kurvcygnus.soulnotes.ai.agent.EmpatheticChatAgent;
import kurvcygnus.soulnotes.ai.agent.WarningDetectionAgent;
import kurvcygnus.soulnotes.ai.dto.WarningDetectionResult;
import kurvcygnus.soulnotes.config.ClinicalSchemaNormalizer;
import kurvcygnus.soulnotes.config.PromptProvider;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.utils.JsonUtils;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import kurvcygnus.soulnotes.websocket.AlertDispatchService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ChatService} 反射单元测试</b>
 * <p>通过反射验证私有辅助方法的正确性, 并以 fake Agent 替身驱动 {@code callAiAndRespond}
 * 主链路, 验证结构化输出管线的契约组装与拆流落库时序.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class ChatServiceTest
{
    //region 结构化输出管线测试基建
    private static final Vertx VERTX = Vertx.vertx();

    private static final String VALID_CUSTOM_SCHEMA =
        "{\"type\": \"object\", \"properties\": {\"gad7\": {\"type\": \"integer\"}}, \"required\": [\"gad7\"]}";

    @TempDir
    static Path tempDir;

    @AfterAll static void closeVertx() { VERTX.closeAndAwait(); }

    @BeforeAll
    @SuppressWarnings("InstantiationOfUtilityClass")//! JsonUtils 为 final 全静态成员类, IDE 误报实例化; 构造器正是 CDI 桥接注入入口.
    static void initMapper()
    {
        //* 纯单元测试无 CDI 容器, 手动构造与生产等价的 mapper (addMessage/历史构建均依赖 JsonUtils).
        new JsonUtils(new ObjectMapper().registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule()));
    }

    //* 共情 Agent 替身: 记录 systemPrompt 入参供契约组装断言, chatSync 返回预置回复.
    private static final class RecordingChatAgent implements EmpatheticChatAgent
    {
        final List<String> systemPrompts = new java.util.ArrayList<>();
        private final String cannedReply;

        RecordingChatAgent(String cannedReply) { this.cannedReply = cannedReply; }

        @Override public String chatSync(String systemPrompt, String userId, String history, String content)
        {
            systemPrompts.add(systemPrompt);
            return cannedReply;
        }

        @Override public TokenStream chat(String systemPrompt, String userId, String history, String content)
        { throw new UnsupportedOperationException("本组测试只驱动同步回复路径"); }
    }

    //* 预警 Agent 替身: 恒返回 NONE, 使 applyWarning 完全静默, 排除预警推送对断言的干扰.
    private static final class StubWarningAgent implements WarningDetectionAgent
    {
        @Override public WarningDetectionResult detect(String systemPrompt, String content)
        { return new WarningDetectionResult("NONE", "", ""); }
    }

    @SuppressWarnings("ConstantConditions")//! 测试缝: Vertx 为类级共享实例, 其余未用依赖置 null 是纯单测构造服务实例的唯一途径.
    private static ChatService newService(boolean taggingOn, PromptProvider promptProvider, ClinicalSchemaNormalizer normalizer)
    { return new ChatService(new RecordingChatAgent(""), new StubWarningAgent(), promptProvider, normalizer, null, newDispatchStub(), newTitleGeneratorStub(), newFollowupGeneratorStub(), emptyRegistry(), VERTX, 50, taggingOn); }

    //* 主链路替身: buildSystemPrompt 在 executeBlocking 内执行, 必须注入可用的 PromptProvider (空配置 = 内置默认).
    @SuppressWarnings("ConstantConditions")//! 测试缝: clinicalAssessmentService 置 null — 本组用例不驱动评估落库挂点.
    private static ChatService newService(boolean taggingOn, EmpatheticChatAgent chatAgent)
    {
        return new ChatService(chatAgent, new StubWarningAgent(), new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()), unusedNormalizer(), null, newDispatchStub(), newTitleGeneratorStub(), newFollowupGeneratorStub(), emptyRegistry(), VERTX, 50, taggingOn);
    }

    //* 空扩展注册表: 本组用例不驱动扩展情境注入, 空注册表 = collectExtensionContext 恒空串 (与无注入等价).
    private static kurvcygnus.soulnotes.domain.extension.ExtensionRegistry emptyRegistry()
    { return registryOf(java.util.List.of()); }

    //* 扩展注册表替身构造缝: 匿名 Instance 承载任意 bean 集 (仿 ExtensionRegistryTest#fake, 纯单测无 CDI 容器).
    private static kurvcygnus.soulnotes.domain.extension.ExtensionRegistry registryOf(
        java.util.List<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>> beans
    )
    {
        return new kurvcygnus.soulnotes.domain.extension.ExtensionRegistry(
            new jakarta.enterprise.inject.Instance<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>>()
            {
                @Override public java.util.Iterator<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>> iterator() { return java.util.List.<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>>copyOf(beans).iterator(); }
                @Override public kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?> get() { return beans.getFirst(); }
                @Override public boolean isUnsatisfied() { return beans.isEmpty(); }
                @Override public boolean isAmbiguous() { return beans.size() > 1; }
                @Override public void destroy(kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?> bean) { throw new UnsupportedOperationException(); }
                @Override public Iterable<jakarta.enterprise.inject.Instance.Handle<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>>> handles() { return java.util.List.of(); }
                @Override public jakarta.enterprise.inject.Instance.Handle<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>> getHandle() { throw new IllegalStateException("测试注册表无 bean 句柄语义"); }
                @Override public jakarta.enterprise.inject.Instance<kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>> select(java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
                @Override public <U extends kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>> jakarta.enterprise.inject.Instance<U> select(Class<U> subtype, java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
                @Override public <U extends kurvcygnus.soulnotes.domain.extension.IDataExtension<?, ?>> jakarta.enterprise.inject.Instance<U> select(jakarta.enterprise.util.TypeLiteral<U> typeLiteral, java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
            },
            new ObjectMapper()
        );
    }

    //* 标题生成器替身: 本组用例只驱动 callAiAndRespond 拆流路径 (不经过标题挂点), 空实现占位即可.
    private static SessionTitleGenerator newTitleGeneratorStub()
    {
        return new SessionTitleGenerator(new StubTitleAgent(), VERTX);
    }

    //* 标题 Agent 替身: 本组用例不触达标题链路, 恒抛错以暴露意外触达.
    private static final class StubTitleAgent implements kurvcygnus.soulnotes.ai.agent.SessionTitleAgent
    {
        @Override public String generateTitle(String systemPrompt, String userContent, String assistantReply)
        { throw new UnsupportedOperationException("本组测试不驱动标题生成链路"); }
    }

    //* 候选追问生成器替身: 本组用例不经过追问挂点, 空实现占位即可 (SessionTitleGenerator 同款).
    private static FollowupGenerator newFollowupGeneratorStub()
    {
        return new FollowupGenerator(new StubFollowupAgent(), VERTX);
    }

    //* 候选追问 Agent 替身: 本组用例不触达追问链路, 恒抛错以暴露意外触达.
    private static final class StubFollowupAgent implements kurvcygnus.soulnotes.ai.agent.FollowupAgent
    {
        @Override public String generateFollowups(String systemPrompt, String userContent, String assistantReply)
        { throw new UnsupportedOperationException("本组测试不驱动候选追问生成链路"); }
    }

    //* dispatch 替身: 空渠道 + 冷却逃生门 (minutes<=0 旁路冷却判定, 不触 Redis → redisDS 置 null 安全);
    //* 本组用例的预警 Agent 恒返回 NONE, 分发器只作为构造占位, 永不被触达.
    @SuppressWarnings("ConstantConditions")//! 测试缝: 未用依赖置 null 是纯单测构造服务实例的唯一途径.
    private static AlertDispatchService newDispatchStub() { return new AlertDispatchService(List.of(), null, 0); }

    //* 契约侧替身: LLM 替身一旦被调用即测试失败 — 默认旁路与缓存查询 (cachedFor) 都不允许触发归一化.
    private static ClinicalSchemaNormalizer unusedNormalizer()
    {
        return new ClinicalSchemaNormalizer(
            new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()),
            "", "", "test-model", newCacheFile(),
            prompt ->
            {
                Objects.requireNonNull(prompt);
                throw new AssertionError("契约组装不得触发 LLM 归一化调用");
            }
        );
    }

    private static Path newCacheFile()
    {
        try { return Files.createTempDirectory(tempDir, "chat-cache-").resolve("clinical-schema-cache.json"); }
        catch(IOException e) { throw new IllegalStateException(e); }
    }

    private static AiChatSession newSession()
    {
        final var session = new AiChatSession();
        session.id = UUID.randomUUID();
        session.userId = UUID.randomUUID();
        session.messages = "[]";
        session.warningTriggered = false;
        session.updatedAt = Instant.now();
        return session;
    }

    private static String invokeBuildSystemPrompt(ChatService service) throws Exception
    {
        //* @since 1.7.0 userId 穿参随情境注入链退役移除, buildSystemPrompt 收敛为无参私有方法;
        //* @since 2.1.0 增风格块穿参, 本组契约用例恒传空串 (不插风格块 = 逐字节一致语义的被测形态);
        //* @since 2.2.0 再增扩展情境块穿参, 恒传空串 (无扩展贡献 = 不插情境块).
        final var method = ChatService.class.getDeclaredMethod("buildSystemPrompt", String.class, String.class);
        method.setAccessible(true);
        return (String) method.invoke(service, "", "");
    }

    @SuppressWarnings("unchecked")//! Method.invoke 返回 Object, 泛型擦除下强转回 Uni<String> 不可避免.
    private static Uni<String> invokeCallAiAndRespond(ChatService service, AiChatSession session) throws Exception
    { return invokeCallAiAndRespond(service, session, ""); }

    //* 带扩展情境块的驱动形态: 供 collectExtensionContext 产物 → 提示词组装的接线断言 (评审 I-3).
    @SuppressWarnings("unchecked")//! Method.invoke 返回 Object, 泛型擦除下强转回 Uni<String> 不可避免.
    private static Uni<String> invokeCallAiAndRespond(ChatService service, AiChatSession session, String extContext) throws Exception
    {
        final var method = ChatService.class.getDeclaredMethod("callAiAndRespond", AiChatSession.class, String.class, String.class, String.class);
        method.setAccessible(true);
        return (Uni<String>) method.invoke(service, session, "我睡不着", "", extContext);
    }

    private static List<String> assistantContents(AiChatSession session)
    {
        final var messages = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {});
        return messages.stream().filter(m -> "assistant".equals(m.get("role"))).map(m -> m.get("content")).toList();
    }
    //endregion

    //region 结构化输出管线: 契约组装 (三态: 默认 / 自定义已归一 / 自定义未归一)
    @Test void buildSystemPrompt_Off_ReturnsBasePromptOnly() throws Exception
    {
        assertEquals(AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT, invokeBuildSystemPrompt(newService(false, new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()), unusedNormalizer())));
    }

    @Test void buildSystemPrompt_On_DefaultSchema_AppendsShellWithDefaultFields() throws Exception
    {
        final var prompt = invokeBuildSystemPrompt(newService(true, new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()), unusedNormalizer()));
        assertTrue(prompt.startsWith(AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT), "机构/内置提示词必须在前");
        assertTrue(prompt.contains("[输出契约]"), "契约壳必须随 clinical.tagging 注入");
        assertTrue(prompt.contains(AiPromptConstants.CLINICAL_OUTPUT_SCHEMA_DEFAULT), "默认结构定义字段说明必须随契约下发");
    }

    @Test void buildSystemPrompt_On_DefaultSchema_ShellAndSchemaAssembleContract() throws Exception
    {
        final var expected = PrintUtils.quickFormat(
            "{}\n\n{}",
            AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT,
            PrintUtils.quickFormat(AiPromptConstants.CLINICAL_OUTPUT_CONTRACT, AiPromptConstants.CLINICAL_OUTPUT_SCHEMA_DEFAULT)
        );
        assertEquals(expected, invokeBuildSystemPrompt(newService(true, new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()), unusedNormalizer())));
    }

    @Test void buildSystemPrompt_On_InstitutionalPromptStaysFirst() throws Exception
    {
        //* 合并规则: 机构提示词在前, 功能契约段在后 — 契约首行的最高优先级声明兜底机构指令冲突.
        final var provider = new PromptProvider(Optional.of("机构自定义人设"), Optional.empty(), Optional.empty());
        final var expected = PrintUtils.quickFormat(
            "{}\n\n{}",
            "机构自定义人设",
            PrintUtils.quickFormat(AiPromptConstants.CLINICAL_OUTPUT_CONTRACT, AiPromptConstants.CLINICAL_OUTPUT_SCHEMA_DEFAULT)
        );
        assertEquals(expected, invokeBuildSystemPrompt(newService(true, provider, unusedNormalizer())));
    }

    @Test void buildSystemPrompt_On_CustomNormalizedSchema_AppendsNormalizedSchema() throws Exception
    {
        final var provider = new PromptProvider(Optional.empty(), Optional.empty(), Optional.of("输出 gad7 分数与风险"));
        //* 预热缓存: 模拟启动期归一化已成功.
        final var normalizer = new ClinicalSchemaNormalizer(provider, "", "", "test-model", newCacheFile(), prompt ->
        {
            Objects.requireNonNull(prompt);
            return VALID_CUSTOM_SCHEMA;
        });
        assertNotNull(normalizer.ensureNormalized());

        final var prompt = invokeBuildSystemPrompt(newService(true, provider, normalizer));

        assertTrue(prompt.contains("gad7"), "已归一化的自定义结构必须随契约下发");
        assertTrue(prompt.contains("[输出契约]"), "契约壳仍需注入");
        assertTrue(prompt.startsWith("输出 gad7 分数与风险".strip()) || prompt.contains(AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT), "基础提示词仍在前");
    }

    @Test void buildSystemPrompt_On_CustomUnNormalizedSchema_FallsBackToBaseOnly() throws Exception
    {
        final var provider = new PromptProvider(Optional.empty(), Optional.empty(), Optional.of("输出 gad7 分数与风险"));
        //* 空缓存替身: cachedFor 必须只查缓存不触发 LLM, 未命中 = 增强暂禁.
        final var normalizer = new ClinicalSchemaNormalizer(provider, "", "", "test-model", newCacheFile(),
            prompt ->
            {
                Objects.requireNonNull(prompt);
                throw new AssertionError("缓存查询不得触发 LLM 归一化调用");
            });

        assertEquals(AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT, invokeBuildSystemPrompt(newService(true, provider, normalizer)),
            "自定义结构未归一化时结构化增强暂禁, 仅发送基础提示词");
    }
    //endregion

    //region 结构化输出管线: 拆流落库时序
    //! 纯单测无 Hibernate 上下文, persist 必然失败并触发兜底消息路径 — 但拆流与 addMessage 发生在 persist 之前,
    //! 断言只关注 persist 前已完成的落库文本与 systemPrompt 入参, Uni 失败属预期环境限制.
    @Test void callAiAndRespond_On_SplitsBlockBeforePersist() throws Exception
    {
        final var reply = "今天辛苦了<!--soulnotes {\"tags\": [\"疲惫\"], \"riskLevel\": \"NONE\", \"summary\": \"ok\"}-->";
        final var agent = new RecordingChatAgent(reply);
        final var session = newSession();

        invokeCallAiAndRespond(newService(true, agent), session).
            onFailure().recoverWithItem(() -> null).await().atMost(Duration.ofSeconds(10));

        assertEquals(PrintUtils.quickFormat("{}\n\n{}", AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT, PrintUtils.quickFormat(AiPromptConstants.CLINICAL_OUTPUT_CONTRACT, AiPromptConstants.CLINICAL_OUTPUT_SCHEMA_DEFAULT)), agent.systemPrompts.getFirst(), "契约开启时 systemPrompt 必须携带契约壳与默认结构定义");
        final var stored = assistantContents(session);
        assertEquals("今天辛苦了", stored.getFirst(), "落库文本必须是剥离契约块后的正文 (历史回喂不再携带契约块)");
        assertFalse(stored.getFirst().contains("soulnotes"));
    }

    @Test void callAiAndRespond_Off_KeepsByteIdenticalBehavior() throws Exception
    {
        final var reply = "正文<!--soulnotes {\"riskLevel\": \"NONE\"}-->";
        final var agent = new RecordingChatAgent(reply);
        final var session = newSession();

        invokeCallAiAndRespond(newService(false, agent), session).
            onFailure().recoverWithItem(() -> null).await().atMost(Duration.ofSeconds(10));

        assertEquals(AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT, agent.systemPrompts.getFirst(), "契约关闭时 systemPrompt 不得附加契约段");
        assertEquals(reply, assistantContents(session).getFirst(), "off 时即使模型异常输出块也原样落库 — 与现状逐字节一致");
    }
    //endregion
    //region 扩展情境收集 fail-open (P3, 评审 I-3)
    //* SPI 契约虽要求实现方自持失败, 框架侧超时/失败降级是第二道保险: 单扩展故障必须收敛为 "无贡献",
    //* 绝不允许阻断 send 主链路或污染共情提示词.
    record ExtArgs() {}

    //* 抛错替身: aiContextContribution 恒失败 (违约实现, 检验框架侧 onFailure 降级).
    static final class ThrowingExt implements kurvcygnus.soulnotes.domain.extension.IDataExtension<String, ExtArgs>
    {
        @Override public String name() { return "boom-ext"; }
        @Override public Class<ExtArgs> argsType() { return ExtArgs.class; }
        @Override public String query(UUID userId, ExtArgs args) { return "无关数据"; }
        @Override public kurvcygnus.soulnotes.domain.extension.LLMToolSpec aiCallCommand() { return null; }
        @Override public Uni<String> aiContextContribution(UUID userId)
        { return Uni.createFrom().failure(new IllegalStateException("boom")); }
    }

    //* 迟滞替身: 600ms 后才产出, 必然撞上 300ms 收集超时窗 (检验框架侧 ifNoItem 降级).
    static final class LaggardExt implements kurvcygnus.soulnotes.domain.extension.IDataExtension<String, ExtArgs>
    {
        @Override public String name() { return "lag-ext"; }
        @Override public Class<ExtArgs> argsType() { return ExtArgs.class; }
        @Override public String query(UUID userId, ExtArgs args) { return "无关数据"; }
        @Override public kurvcygnus.soulnotes.domain.extension.LLMToolSpec aiCallCommand() { return null; }
        @Override public Uni<String> aiContextContribution(UUID userId)
        { return Uni.createFrom().item("迟滞贡献").onItem().delayIt().by(Duration.ofMillis(600)); }
    }

    @Test void collectExtensionContext_ThrowingAndLaggardExtensions_ShouldFailOpenToEmptyContext() throws Exception
    {
        final var badRegistry = registryOf(java.util.List.of(new ThrowingExt(), new LaggardExt()));
        final var service = new ChatService(new RecordingChatAgent(""), new StubWarningAgent(),
            new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()), unusedNormalizer(), null,
            newDispatchStub(), newTitleGeneratorStub(), newFollowupGeneratorStub(), badRegistry, VERTX, 50, false);

        //* 收集链必须成功完成 (send 仍 200 的服务层等价物) 且归一为空串 — 双缺陷扩展均被框架侧降级吸收.
        final var method = ChatService.class.getDeclaredMethod("collectExtensionContext", UUID.class);
        method.setAccessible(true);
        final var start = System.nanoTime();
        @SuppressWarnings("unchecked") final var context = (Uni<String>) method.invoke(service, UUID.randomUUID());
        final var block = context.await().atMost(Duration.ofSeconds(10));
        assertTrue(Duration.ofNanos(System.nanoTime() - start).toMillis() >= 250,
            "收集耗时应 >= 迟滞替身真实撞上的 300ms 超时窗 (远小于此说明替身未生效)");
        assertEquals("", block, PrintUtils.quickFormat("抛错 + 迟滞双缺陷必须降级为无贡献空串, 实际: {}", block));

        //* 收集产物 (空串) 进入组装后, 共情提示词必须无情境块 — 与无注入形态逐字节一致 (send 成功闭环).
        final var agent = new RecordingChatAgent("ok");
        final var sending = new ChatService(agent, new StubWarningAgent(),
            new PromptProvider(Optional.empty(), Optional.empty(), Optional.empty()), unusedNormalizer(), null,
            newDispatchStub(), newTitleGeneratorStub(), newFollowupGeneratorStub(), badRegistry, VERTX, 50, false);
        invokeCallAiAndRespond(sending, newSession(), block).
            onFailure().recoverWithItem(() -> null).await().atMost(Duration.ofSeconds(10));
        assertEquals(AiPromptConstants.EMPATHETIC_CHAT_SYSTEM_PROMPT, agent.systemPrompts.getFirst(),
            "双缺陷扩展下共情提示词不得携带情境块 (哨兵句缺席)");
    }
    //endregion

    //region countMessages
    @Test void countMessages_NullInput_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages");
        assertEquals(0, method.invoke(null, (String) null));
    }

    @Test void countMessages_BlankInput_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages");
        assertEquals(0, method.invoke(null, ""));
    }

    @Test void countMessages_EmptyArray_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages");
        assertEquals(0, method.invoke(null, "[]"));
    }

    @Test void countMessages_SingleMessage_ShouldReturnOne() throws Exception
    {
        final var method = getStaticMethod("countMessages");
        final var json    = "[{\"role\":\"user\",\"content\":\"hello\"}]";
        assertEquals(1, method.invoke(null, json));
    }

    @Test void countMessages_MultipleMessages_ShouldReturnCount() throws Exception
    {
        final var method = getStaticMethod("countMessages");
        final var json   = "[{\"role\":\"user\",\"content\":\"a\"},{\"role\":\"assistant\",\"content\":\"b\"}]";
        assertEquals(2, method.invoke(null, json));
    }

    @Test void countMessages_InvalidJson_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages");
        assertEquals(0, method.invoke(null, "{invalid}"));
    }
    //endregion

    //region getPreview
    @Test void getPreview_NullInput_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview");
        assertEquals("", method.invoke(null, (String) null));
    }

    @Test void getPreview_BlankInput_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview");
        assertEquals("", method.invoke(null, ""));
    }

    @Test void getPreview_EmptyArray_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview");
        assertEquals("", method.invoke(null, "[]"));
    }

    @Test void getPreview_ShortContent_ShouldReturnFull() throws Exception
    {
        final var method = getStaticMethod("getPreview");
        final var json   = "[{\"role\":\"user\",\"content\":\"今天心情不错\"}]";
        assertEquals("今天心情不错", method.invoke(null, json));
    }

    @Test void getPreview_LongContent_ShouldTruncate() throws Exception
    {
        final var method = getStaticMethod("getPreview");
        final var content = "a".repeat(100);
        final var json    = "[{\"role\":\"user\",\"content\":\"" + content + "\"}]";
        final var result  = (String) method.invoke(null, json);
        assertTrue(result.endsWith("..."));
        assertEquals(53, result.length()); //* 50 + "..."
    }

    @Test void getPreview_InvalidJson_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview");
        assertEquals("", method.invoke(null, "{broken"));
    }
    //endregion

    //region 反射工具
    //* 既有用例全部针对单 String 参的静态方法, 参数类型收敛在 helper 内, 免去逐用例重复传参.
    private static Method getStaticMethod(String name) throws NoSuchMethodException
    {
        final var method = ChatService.class.getDeclaredMethod(name, String.class);
        assertTrue(Modifier.isStatic(method.getModifiers()), "方法 " + name + " 应为 static");
        assertTrue(Modifier.isPrivate(method.getModifiers()), "方法 " + name + " 应为 private");
        method.setAccessible(true);
        return method;
    }
    //endregion
}
