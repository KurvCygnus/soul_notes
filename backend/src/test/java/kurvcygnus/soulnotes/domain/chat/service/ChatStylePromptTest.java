package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.MockLlmServer;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.support.SchemaGuards;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.hibernate.reactive.mutiny.Mutiny;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>聊天风格提示词注入集成测试</b> (Mock-LLM 驱动).
 * <p>钉死 Task 1 的提示词组装契约: 顺序恒定 [安全序言 (基础提示词内, 不可变)] → [基础倾听者提示词] →
 * [风格块 (可选)] → [扩展情境参考 (clinical.tagging 契约段, 如有)]; 全 default (含无行) 时不插风格块;</p>
 * <p>安全边界: 预警检测请求的 system prompt 恒不含风格块 — 用户措辞偏好绝不影响预警判定语义.</p>
 * <p>基建守卫与 {@code ChatPipelineTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 2.1.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过聊天风格提示词用例")
class ChatStylePromptTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    //* 安全序言锚点: 内置基础提示词的安全规则节首行 — 组装顺序断言的定位基准
    //* (内置默认人设未接 ai.prompt.* 覆盖的测试环境下恒定存在).
    private static final String SAFETY_PREAMBLE_ANCHOR = "安全规则";

    //* 扩展情境参考锚点: 结构化输出契约段首行 (MockLlmProfile 恒开 clinical.tagging).
    private static final String CONTRACT_ANCHOR = "[输出契约]";

    @Inject Mutiny.SessionFactory sessionFactory;

    @BeforeEach
    void rearm()
    {
        SchemaGuards.ensureChatStyleTable(sessionFactory);
        //* 标题列增量之外, 实体映射还消费 pinned_at/title_source 两列 (追问链 PESSIMISTIC_WRITE 读整行):
        //* 开发库/CI 库可能未应用 08 迁移, 幂等补齐 (评审 M-5, 四测试类同款先例).
        SchemaGuards.ensureChatSessionPinRenameColumns(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 全 default 不注入 (与现状逐字节一致)
    @Test void send_AllDefaults_SystemPromptShouldNotCarryStyleBlock()
    {
        final var account = PipelineUsers.register();//* 无风格行: GET 默认语义的对话侧镜像.
        MockLlmProfile.server().respondWithText("我在听。");

        chatSend(account.token(), "今天有点累");

        final var prompt = empatheticSystemPrompt();
        assertFalse(
            prompt.contains(AiPromptConstants.CHAT_STYLE_BLOCK_PREAMBLE),
            PrintUtils.quickFormat("全 default 时 system prompt 不得注入风格块, 实际: {}", prompt)
        );
        assertFalse(prompt.contains("表达基调:"), "全 default 时不得残留任何风格轴行");
    }
    //endregion

    //region ② 风格块注入与组装顺序 (安全序言 → 风格块 → 契约段)
    @Test void send_WittyStyle_SystemPromptShouldCarryStyleBlockAfterSafetyPreamble()
    {
        final var account = PipelineUsers.register();
        putStyle(account.token(), fullBody("witty", "more", "default", "default", "less"));
        MockLlmProfile.server().respondWithText("哈, 我在听。");

        chatSend(account.token(), "今天有点累");

        final var prompt = empatheticSystemPrompt();
        final var preamble = AiPromptConstants.CHAT_STYLE_BLOCK_PREAMBLE;
        assertTrue(prompt.contains(preamble), PrintUtils.quickFormat("非 default 时必须注入风格块首行哨兵, 实际: {}", prompt));
        assertTrue(prompt.contains(AiPromptConstants.CHAT_STYLE_DIRECTIVE_WITTY), "风格块必须携带 witty 基调指令句");
        assertTrue(prompt.contains(AiPromptConstants.CHAT_STYLE_WARMTH_MORE), "风格块必须携带 warmth=more 修饰句");
        assertTrue(prompt.contains(AiPromptConstants.CHAT_STYLE_EMOJI_LESS), "风格块必须携带 emoji=less 修饰句");
        assertTrue(
            prompt.indexOf(SAFETY_PREAMBLE_ANCHOR) < prompt.indexOf(preamble),
            "安全序言必须先于风格块 (安全规则节内嵌于基础提示词, 风格块只约束措辞与格式)"
        );
        assertTrue(
            prompt.indexOf(preamble) < prompt.indexOf(CONTRACT_ANCHOR),
            "风格块必须先于扩展情境参考 (契约段), 组装顺序恒定"
        );
    }
    //endregion

    //region ③ 安全边界: 预警检测请求恒无风格块
    @Test void send_WittyStyle_WarningDetectionRequest_ShouldStayStyleFree()
    {
        final var account = PipelineUsers.register();
        putStyle(account.token(), fullBody("witty", "more", "more", "more", "more"));
        MockLlmProfile.server().respondWithText("我听到了你的痛苦。");

        chatSend(account.token(), MockLlmServer.RED_KEYWORD + " 我真的撑不下去了");

        final var prompt = warningSystemPrompt();
        assertTrue(prompt.contains("心理危机预警检测器"), "锚点自检: 断言对象必须是预警检测请求的 system prompt");
        assertFalse(
            prompt.contains(AiPromptConstants.CHAT_STYLE_BLOCK_PREAMBLE),
            PrintUtils.quickFormat("预警检测请求不得携带风格块, 实际: {}", prompt)
        );
    }
    //endregion

    //region 测试脚手架
    //* POST /chat/send (非流式, 新会话): ChatSessionManageTest 同口径.
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

    private static void putStyle(String token, String body)
    {
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(body).
            when().
            put(ApiEndpointConstants.ME_BASE + "/chat-style").
            then().
            statusCode(200);
    }

    private static String fullBody(String style, String warmth, String enthusiasm, String headings, String emoji)
    {
        //* quickFormat (SLF4J arrayFormat) 只替换 "{}" 占位符: 单个花括号键名原样保留, 五个 "{}" 恰为五个值位.
        return PrintUtils.quickFormat(
            "{\"style\":\"{}\",\"warmth\":\"{}\",\"enthusiasm\":\"{}\",\"headings\":\"{}\",\"emoji\":\"{}\"}",
            style, warmth, enthusiasm, headings, emoji
        );
    }

    //* 最近一条共情对话请求的 system prompt: 携带工具定义的请求即共情 Agent (预警检测无工具且随后到达,
    //* ChatPipelineTest 同款判据); 标题/追问请求同样无工具, 以 tools 判据天然排除.
    private static String empatheticSystemPrompt()
    {
        final var request = MockLlmProfile.server().requests().stream().
            filter(r -> r.contains("\"tools\"")).
            reduce((first, second) -> second).
            orElseThrow(() -> new AssertionError("mock 应收到共情对话请求"));
        return systemContentOf(request);
    }

    //* 预警检测请求的 system prompt: 无工具且系统提示词含预警检测器锚点 (标题/追问请求被锚点排除).
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
