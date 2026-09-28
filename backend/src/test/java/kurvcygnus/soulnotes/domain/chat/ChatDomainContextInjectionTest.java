package kurvcygnus.soulnotes.domain.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.restassured.RestAssured;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>情境注入管线集成测试</b> (Mock-LLM 全链路, 真库, {@code ai.domain.adapter=simulated}).
 * <p>钉死 {@code DomainContextInjector} → {@code ChatService#buildSystemPrompt} 的接线:
 * simulated 数据源下, 上游共情请求的 system message 必须携带 {@code [学生情境]} 紧凑块,
 * 且块位于基础人设之后、输出契约段之前.</p>
 * <p>独立成类而非并入 {@code ChatPipelineTest}: 单类单 {@code @TestProfile}, 而 simulated
 * 若随 {@link MockLlmProfile} 全局启用会击穿 {@code ContextResourceContractTest} 的
 * {@code adapter=none} 空数组契约断言 — 故以委托式局部 profile 仅本类启用.</p>
 * @since 1.5.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(ChatDomainContextInjectionTest.SimulatedDomainProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过情境注入管线用例")
class ChatDomainContextInjectionTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    //* 用例隔离: 清空 mock 录制, 防止跨用例的请求累积干扰断言 (与 ChatPipelineTest.rearm 同款).
    @org.junit.jupiter.api.BeforeEach
    void rearm() { MockLlmProfile.server().reset(); }

    //* 局部 profile: 委托 MockLlmProfile 全量装配 (mock 指向/真库/随机端口), 仅追加 simulated 域适配器开关.
    public static final class SimulatedDomainProfile implements QuarkusTestProfile
    {
        private final MockLlmProfile base = new MockLlmProfile();

        @Override public Map<String, String> getConfigOverrides()
        {
            final var overrides = new HashMap<>(base.getConfigOverrides());
            overrides.put("ai.domain.adapter", "simulated");
            return Map.copyOf(overrides);
        }

        @Override public Set<Class<?>> getEnabledAlternatives() { return base.getEnabledAlternatives(); }
    }

    //* @since 1.5.0 注入管线: adapter=simulated 时上游 system prompt 必须含情境块 (考试名 + 自然引用约束),
    //* 且情境块在契约段之前 (基础人设 → 情境 → 输出契约的合并次序).
    @Test
    void chat_SystemPromptContainsDomainContext() throws Exception
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText("我在这里陪着你。");

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"content\":\"{}\"}", "下周有什么安排")).
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/send").
            then().
            statusCode(200).
            extract().asString();
        assertEquals(0, MAPPER.readTree(body).path("code").asInt(), PrintUtils.quickFormat("业务码应为 0: {}", body));

        //* 沿用 ChatPipelineTest 取请求口径: 共情对话请求携带 tools 定义 (预警检测请求无工具且随后到达).
        final var chatRequest = MockLlmProfile.server().requests().stream().
            filter(r -> r.contains("\"tools\"")).
            reduce((first, second) -> second).
            orElseThrow(() -> new AssertionError("mock 应收到共情对话请求"));
        final var first = MAPPER.readTree(chatRequest).path("messages").path(0);
        assertEquals("system", first.path("role").asText(), "首条消息应为 system");
        final var system = first.path("content").asText();
        assertTrue(system.contains("[学生情境]"), PrintUtils.quickFormat("system prompt 必须含情境块标记, 实际: {}", system));
        assertTrue(system.contains("高等数学期中考"), PrintUtils.quickFormat("情境块必须携带近期考试: {}", system));
        assertTrue(system.contains("自然引用"), PrintUtils.quickFormat("情境块必须携带自然引用约束: {}", system));
        assertTrue(system.indexOf("[学生情境]") < system.indexOf("[输出契约]"), "情境块必须在契约段之前 (临床契约首行优先级声明兜底)");
    }
}
