package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.MockLlmServer;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.support.SchemaGuards;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.hibernate.reactive.mutiny.Mutiny;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>候选追问 (followups) 生成链路集成测试</b> (Mock-LLM 驱动, 真库).
 * <p>覆盖: 每轮 AI 回复落库后追问经 AI 生成并追加至最近一条 assistant 消息 (prompt 携带本轮用户消息 + AI 回复);
 * REST 历史回放透传追问 (无则空数组); SSE 流尾随 followups 事件 (恰好 3 条);
 * 追问 LLM 失败时聊天不受影响且无追问产物 (send/stream 两路径对称).</p>
 * <p>基建守卫与 {@code ChatSessionTitleTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 1.8.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过候选追问链路用例")
class ChatFollowupTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final Duration AWAIT = Duration.ofSeconds(20);
    //* 追问生成为回复落库后的 fire-and-forget 异步链 (含二次 LLM 调用): 落库/事件到达有秒级延迟, 轮询窗口放宽到 20s.
    private static final long FOLLOWUP_POLL_DEADLINE_MS = 20_000;
    //* "失败即无产物"的静默观察窗: 若误将失败产物落库/发事件, 秒级内必达.
    private static final long FAILURE_QUIET_WINDOW_MS = 3_000;

    private static final String USER_MESSAGE     = "考试周睡不着怎么办";
    private static final String ASSISTANT_REPLY  = "愿意说出来, 已经很有勇气了。";
    private static final List<String> EXPECTED_FOLLOWUPS = List.of("追问甲", "追问乙", "追问丙");

    @Inject Mutiny.SessionFactory sessionFactory;

    @TestHTTPResource(ApiEndpointConstants.CHAT_BASE + "/stream") URI streamUri;

    @BeforeEach
    void rearm()
    {
        SchemaGuards.ensureChatSessionTitleColumn(sessionFactory);
        //* 标题列增量之外, 实体映射还消费 pinned_at/title_source 两列 (追问链 PESSIMISTIC_WRITE 读整行):
        //* 开发库/CI 库可能未应用 08 迁移, 幂等补齐 (Task 8 顺修, SchemaGuards 契约).
        SchemaGuards.ensureChatSessionPinRenameColumns(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 每轮生成并落库
    @Test
    void chatSend_AssistantReplyLands_ShouldPersistFollowupsFromThisRound()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText(ASSISTANT_REPLY);

        chatSend(account.token(), USER_MESSAGE);

        final var session = pollFollowups(account.userId());
        assertEquals(EXPECTED_FOLLOWUPS, readLastAssistantFollowups(session),
            PrintUtils.quickFormat("AI 消息落库必须携带恰好 3 条追问, 实际 messages: {}", session.messages));

        //* 追问请求恰好一轮, 且必须携带本轮用户消息与 AI 回复 (追问只从最近一轮交换取材).
        final var followupRequests = anchoredRequests();
        assertEquals(1, followupRequests.size(), PrintUtils.quickFormat("追问链路应恰好一轮 LLM 请求, 全部请求: {}", MockLlmProfile.server().requests().size()));
        assertTrue(followupRequests.getFirst().contains(USER_MESSAGE), "追问 prompt 必须携带本轮用户消息");
        assertTrue(followupRequests.getFirst().contains(ASSISTANT_REPLY), "追问 prompt 必须携带本轮 AI 回复");
    }

    //* REST 会话消息契约: AI 消息带 followups 数组, 用户消息为空数组 (形状统一, 前端免判角色).
    @Test
    void listMessages_ShouldCarryFollowupsOnAssistantAndEmptyArrayOnUser()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText(ASSISTANT_REPLY);
        chatSend(account.token(), USER_MESSAGE);
        pollFollowups(account.userId());

        final var sessionId = latestSession(account.userId()).id;
        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.CHAT_BASE + "/sessions/" + sessionId + "/messages").
            then().
            statusCode(200).
            extract().asString();

        final var data = readTree(body).path("data");
        assertEquals(2, data.size(), PrintUtils.quickFormat("应含 user + assistant 两条消息: {}", body));
        assertTrue(data.path(0).path("followups").isArray() && data.path(0).path("followups").isEmpty(),
            PrintUtils.quickFormat("user 消息的 followups 应为空数组: {}", body));
        assertEquals(EXPECTED_FOLLOWUPS, stringList(data.path(1).path("followups")),
            PrintUtils.quickFormat("AI 消息必须透传落库追问: {}", body));
    }
    //endregion

    //region ② SSE 流尾随事件
    @Test
    void chatStream_ShouldEmitFollowupsTrailingEventAfterTokens() throws Exception
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithChunks("夜色", "很温柔");

        final var events = streamViaSse(account.token(), "给我讲点什么吧");

        assertFalse(events.isEmpty(), "SSE 流必须到达事件");
        assertEquals("meta", typeOf(events.getFirst()),
            PrintUtils.quickFormat("流首事件必须为 meta JSON, 实际: {}", events.getFirst()));
        assertEquals("followups", typeOf(events.getLast()),
            PrintUtils.quickFormat("流尾事件必须为 followups 尾随 JSON, 实际末事件: {}", events.getLast()));
        assertEquals(EXPECTED_FOLLOWUPS, stringList(readTree(events.getLast()).path("items")),
            PrintUtils.quickFormat("尾随事件必须携带恰好 3 条追问: {}", events.getLast()));

        //* meta 与尾随事件之外为纯 token 流: 拼接等于 mock 文本 (既有 token 契约不因尾随事件改变).
        final var tokens = events.subList(1, events.size() - 1);
        assertEquals("夜色很温柔", String.join("", tokens), "token 拼接应等于 mock 文本");

        //* 尾随事件与落库产物同源对账.
        assertEquals(EXPECTED_FOLLOWUPS, readLastAssistantFollowups(pollFollowups(account.userId())), "SSE 事件与落库追问必须一致");
    }
    //endregion

    //region ③ 追问 LLM 失败静默 (fail-open)
    @Test
    void chatSend_FollowupAiFails_ShouldNotAffectChatNorLeaveFollowups()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().failFollowupRequests();//* 追问 LLM 请求一律 500 (模拟 AI 故障).
        MockLlmProfile.server().respondWithText(ASSISTANT_REPLY);

        final var body = chatSend(account.token(), USER_MESSAGE);

        assertEquals(ASSISTANT_REPLY, readTree(body).path("data").path("content").asText(),
            PrintUtils.quickFormat("追问失败时对话回复不得受影响: {}", body));

        quietWindow();
        final var session = latestSession(account.userId());
        assertNotNull(session, "会话应已落库");
        assertEquals(List.of(), readLastAssistantFollowups(session),
            PrintUtils.quickFormat("追问失败不得留下降级产物, 实际 messages: {}", session.messages));
        assertFalse(anchoredRequests().isEmpty(), "追问请求应已被尝试 (500 由 mock 返回, 证明生成链路确被触发)");
    }

    @Test
    void chatStream_FollowupAiFails_ShouldCompleteStreamWithoutFollowupsEvent() throws Exception
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().failFollowupRequests();//* 追问 LLM 请求一律 500 (模拟 AI 故障).
        MockLlmProfile.server().respondWithChunks("夜色", "很温柔");

        final var events = streamViaSse(account.token(), "给我讲点什么吧");

        //* 流必须正常收尾且 token 流完整, 不得出现 followups 尾随事件.
        assertTrue(events.size() >= 2, PrintUtils.quickFormat("meta + token 事件必须到达: {}", events));
        for(final var event: events)
            assertNotEquals("followups", typeOf(event),
                PrintUtils.quickFormat("追问失败时不得发 followups 事件: {}", event));
        final var tokens = events.stream().filter(e -> !"meta".equals(typeOf(e))).toList();
        assertEquals("夜色很温柔", String.join("", tokens), "追问失败时 token 流必须完整");
    }
    //endregion

    //region 测试脚手架
    //* POST /chat/send (非流式): 与 ChatSessionTitleTest 同一口径, 返回响应体供内容断言.
    private static String chatSend(String token, String content)
    {
        return RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"content\":\"{}\"}", content)).
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/send").
            then().
            statusCode(200).
            extract().asString();
    }

    //* SSE 流式读取辅助: 沿用 ChatPipelineTest 同款 HttpClient 按行读流写法, 聚合全部 data 行 (含契约事件).
    private List<String> streamViaSse(String token, String content) throws Exception
    {
        final var request = HttpRequest.newBuilder(streamUri).
            header("Authorization", PipelineUsers.bearer(token)).
            header("Content-Type", "application/json").
            header("Accept", "text/event-stream").
            timeout(Duration.ofSeconds(30)).
            POST(HttpRequest.BodyPublishers.ofString(PrintUtils.quickFormat("{\"content\":\"{}\"}", content))).
            build();

        final var payloads = new ArrayList<String>();
        final var response = HTTP.send(request, HttpResponse.BodyHandlers.ofLines());
        response.body().forEach(line -> { if(line.startsWith("data:")) payloads.add(line.substring("data:".length()).stripLeading()); });
        assertEquals(200, response.statusCode(), "SSE 端点应返回 200");
        return payloads;
    }

    //* 追问锚点请求 (追问 Agent 请求体携带追问系统提示词锚): 供轮次与取材断言.
    private static List<String> anchoredRequests()
    {
        return MockLlmProfile.server().requests().stream().
            filter(r -> r.contains(MockLlmServer.FOLLOWUP_ANCHOR)).
            toList();
    }

    //* 轮询等追问落库 (fire-and-forget 异步链): 超时即断言失败, 附带末次会话状态便于排障.
    private AiChatSession pollFollowups(String userId)
    {
        final var deadline = System.currentTimeMillis() + FOLLOWUP_POLL_DEADLINE_MS;
        var session = latestSession(userId);
        while(System.currentTimeMillis() < deadline && (session == null || readLastAssistantFollowups(session).isEmpty()))
        {
            try { Thread.sleep(200); }
            catch(InterruptedException e) { Thread.currentThread().interrupt(); fail("追问落库轮询被中断"); }
            session = latestSession(userId);
        }
        assertNotNull(session, "会话应已落库");
        assertFalse(readLastAssistantFollowups(session).isEmpty(),
            PrintUtils.quickFormat("{}ms 内追问未落库 (fire-and-forget 链路疑似未执行)", FOLLOWUP_POLL_DEADLINE_MS));
        return session;
    }

    //* 提取最近一条 assistant 消息的追问产物: 落库形态为消息条目 followups 键 (JSON 数组编码文本);
    //* 未携带/为空/损坏一律归一为空列表, 与读取端容错同口径.
    private static List<String> readLastAssistantFollowups(AiChatSession session)
    {
        final var messages = readTree(session.messages);
        for(var i = messages.size() - 1; i >= 0; i--)
        {
            final var entry = messages.path(i);
            if("assistant".equals(entry.path("role").asText()))
            {
                final var raw = entry.path("followups");
                if(raw.isMissingNode() || raw.isNull() || raw.asText().isBlank())
                    return List.of();
                return stringList(readTree(raw.asText()));
            }
        }
        return List.of();
    }

    //* "失败即无产物"的静默观察窗: 给可能误落库/误发事件的异步链留出到达时间.
    private static void quietWindow()
    {
        try { Thread.sleep(FAILURE_QUIET_WINDOW_MS); }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); fail("静默观察窗被中断"); }
    }

    //* 独立事务新开 session 查询该用户最新会话: 读已提交数据, 不受任何一级缓存干扰 (ChatSessionTitleTest 同款).
    private AiChatSession latestSession(String userId)
    {
        return sessionFactory.withTransaction((session, tx) ->
            session.createQuery("from AiChatSession s where s.userId = ?1 order by s.updatedAt desc", AiChatSession.class).
                setParameter(1, UUID.fromString(userId)).
                setMaxResults(1).
                getSingleResultOrNull()
        ).await().atMost(AWAIT);
    }

    //* JsonNode 字符串数组 -> List<String> (项目 Jackson 版本无 toList 便捷方法, MockLlmServer 同款).
    private static List<String> stringList(JsonNode array)
    {
        assertTrue(array.isArray(), PrintUtils.quickFormat("应为 JSON 数组, 实际: {}", array));
        final var result = new ArrayList<String>();
        for(final var node: array)
            result.add(node.asText());
        return List.copyOf(result);
    }

    //* 契约事件类型提取 (容错): 纯文本 token 不是 JSON 对象, 解析失败一律视为无类型 "" —
    //* 与 ChatPipelineTest 的契约事件判定同口径.
    private static String typeOf(String payload)
    {
        try { return MAPPER.readTree(payload).path("type").asText(""); }
        catch(Exception e) { return ""; }
    }

    private static JsonNode readTree(String json)
    {
        try { return MAPPER.readTree(json); }
        catch(Exception e) { throw new AssertionError(PrintUtils.quickFormat("响应不是合法 JSON: {}", json), e); }
    }
    //endregion
}
