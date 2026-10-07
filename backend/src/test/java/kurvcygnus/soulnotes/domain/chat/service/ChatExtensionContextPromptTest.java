package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.extension.builtin.DemoCampusData;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.MockLlmServer;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.support.SchemaGuards;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.hibernate.reactive.mutiny.Mutiny;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>扩展情境注入集成测试</b> (Mock-LLM 驱动, P3 Task 1).
 * <p>钉死注入契约: 课表扩展的 {@code aiContextContribution} 产物以 "当前情境参考" 块注入共情对话
 * system prompt, 组装顺序恒定 [安全序言 (基础提示词内)] → [基础倾听者提示词] → [风格块 (可选)] →
 * [情境块 (当日有课)] → [契约段]; 周末无课日不注入 (无贡献 = 无块).</p>
 * <p>安全边界: 预警检测请求的 system prompt 恒不含情境块 — 用户处境参考绝不影响预警判定语义
 * (与 P2 chat-style 同款豁免, 预警/标题/追问/副医生四链不收集).</p>
 * <p>基建守卫与 {@code ChatPipelineTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 2.2.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过扩展情境注入用例")
class ChatExtensionContextPromptTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    //* 组装顺序断言的定位基准 (ChatStylePromptTest 同款锚点).
    private static final String SAFETY_PREAMBLE_ANCHOR = "安全规则";
    private static final String CONTRACT_ANCHOR        = "[输出契约]";
    //* 情境块首行哨兵句: 断言锚点与 GREEN 实现共用同一常量, 改写须同步 (风格块哨兵同款纪律).
    private static final String CONTEXT_PREAMBLE_ANCHOR = AiPromptConstants.CHAT_EXT_CONTEXT_PREAMBLE;

    @Inject Mutiny.SessionFactory sessionFactory;

    @BeforeEach
    void rearm()
    {
        //* 对话链路的库依赖全量守卫: 风格表 (loadStyleDirectives) + 标题/置顶/来源列 (挂点落库).
        SchemaGuards.ensureChatStyleTable(sessionFactory);
        SchemaGuards.ensureChatSessionTitleColumn(sessionFactory);
        SchemaGuards.ensureChatSessionPinRenameColumns(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 情境块注入与组装顺序
    @Test void send_TimetableContribution_ShouldInjectContextBlockBeforeContract()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText("我在听。");

        chatSend(account.token(), "今天有点累");

        final var prompt = empatheticSystemPrompt();
        //* 期望值与生产实现共用同一数据源 (DemoCampusData): 周末无课日走 "不注入" 分支, 两分支都确定性.
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI).getDayOfWeek();
        final var contribution = DemoCampusData.contextLine(today);
        if(contribution == null)
        {
            assertFalse(
                prompt.contains(CONTEXT_PREAMBLE_ANCHOR),
                PrintUtils.quickFormat("周末无课日不得注入情境块, 实际: {}", prompt)
            );
            return;
        }
        assertTrue(prompt.contains(CONTEXT_PREAMBLE_ANCHOR), PrintUtils.quickFormat("有课日必须注入情境块哨兵句, 实际: {}", prompt));
        assertTrue(prompt.contains(contribution), PrintUtils.quickFormat("情境块必须携带课表贡献原文: {}", contribution));
        //* 贡献内课名必须原样在场 (Mock-LLM 断言: 课表贡献在 chat system prompt 中).
        assertTrue(prompt.contains(DemoCampusData.timetable(today).getFirst().course()), "课表贡献必须携带首节课课名");
        assertTrue(
            prompt.indexOf(SAFETY_PREAMBLE_ANCHOR) < prompt.indexOf(CONTEXT_PREAMBLE_ANCHOR),
            "安全序言必须先于情境块 (情境块只影响共情措辞, 不触碰安全规则)"
        );
        assertTrue(
            prompt.indexOf(CONTEXT_PREAMBLE_ANCHOR) < prompt.indexOf(CONTRACT_ANCHOR),
            "情境块必须在契约段之前 (组装顺序恒定: 基础 → 风格 → 情境 → 契约)"
        );
    }
    //endregion

    //region ② 安全边界: 预警检测请求恒无情境块
    @Test void send_WarningDetectionRequest_ShouldStayContextFree()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText("我听到了你的痛苦。");

        chatSend(account.token(), MockLlmServer.RED_KEYWORD + " 我真的撑不下去了");

        final var prompt = warningSystemPrompt();
        assertTrue(prompt.contains("心理危机预警检测器"), "锚点自检: 断言对象必须是预警检测请求的 system prompt");
        assertFalse(
            prompt.contains(CONTEXT_PREAMBLE_ANCHOR),
            PrintUtils.quickFormat("预警检测请求不得携带情境块 (四链豁免), 实际: {}", prompt)
        );
    }
    //endregion

    //region 测试脚手架 (ChatStylePromptTest 同款口径)
    private static void chatSend(String token, String content)
    {
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"content\":\"{}\"}", content)).
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/send").
            then().
            statusCode(200);
    }

    //* 最近一条共情对话请求的 system prompt: 携带工具定义的请求即共情 Agent (预警/标题/追问请求无工具).
    private static String empatheticSystemPrompt()
    {
        final var request = MockLlmProfile.server().requests().stream().
            filter(r -> r.contains("\"tools\"")).
            reduce((first, second) -> second).
            orElseThrow(() -> new AssertionError("mock 应收到共情对话请求"));
        return systemContentOf(request);
    }

    //* 预警检测请求的 system prompt: 无工具且系统提示词含预警检测器锚点.
    private static String warningSystemPrompt()
    {
        final var request = MockLlmProfile.server().requests().stream().
            filter(r -> !r.contains("\"tools\"") && r.contains("心理危机预警检测器")).
            reduce((first, second) -> second).
            orElseThrow(() -> new AssertionError("mock 应收到预警检测请求"));
        return systemContentOf(request);
    }

    private static String systemContentOf(String request)
    {
        final JsonNode root;
        try { root = MAPPER.readTree(request); }
        catch(Exception e) { throw new AssertionError("mock 录制的请求不是合法 JSON", e); }
        return root.path("messages").path(0).path("content").asText();
    }
    //endregion
}
