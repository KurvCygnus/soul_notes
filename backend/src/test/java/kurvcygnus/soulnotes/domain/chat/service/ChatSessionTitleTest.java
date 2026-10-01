package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>会话标题生成链路集成测试</b> (Mock-LLM 驱动, 真库).
 * <p>覆盖: 首轮交换完成后标题经 AI 生成并落库 (prompt 携带首条用户消息 + 助手回复);
 * 二轮及以后不再重复生成; LLM 失败 fail-open 降级为首条用户消息截断 20 字;
 * 列表 VO 透传标题且存量会话标题为 null.</p>
 * <p>基建守卫与 {@code ChatPipelineTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 1.6.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过会话标题链路用例")
class ChatSessionTitleTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration AWAIT = Duration.ofSeconds(20);
    //* 标题生成为流/请求收尾后的 fire-and-forget 异步链: 落库到达有秒级延迟, 轮询窗口放宽到 20s.
    private static final long TITLE_POLL_DEADLINE_MS = 20_000;
    //* "不再重复生成"的静默观察窗: 二轮发送返回后, 若误触发标题生成, LLM 请求在秒级内必达 mock.
    private static final long REGEN_QUIET_WINDOW_MS = 3_000;

    private static final String FIRST_USER_MESSAGE  = "考试周睡不着怎么办";
    private static final String FIRST_ASSISTANT_REPLY = "愿意说出来, 已经很有勇气了。";

    @Inject Mutiny.SessionFactory sessionFactory;

    @BeforeEach
    void rearm()
    {
        SchemaGuards.ensureChatSessionTitleColumn(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 首轮交换生成标题
    @Test
    void chatSend_FirstExchange_ShouldGenerateTitleFromFirstExchange()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText(FIRST_ASSISTANT_REPLY);

        chatSend(account.token(), FIRST_USER_MESSAGE);

        final var session = pollSessionTitle(account.userId());
        assertEquals(MockLlmServer.TITLE_REPLY, session.title, PrintUtils.quickFormat("首轮交换后标题应为 mock 标题落库, 实际: {}", session.title));

        //* 标题请求恰好一轮, 且必须携带首条用户消息与助手回复 (标题只从首轮交换取材).
        final var titleRequests = titleRequests();
        assertEquals(1, titleRequests.size(), PrintUtils.quickFormat("标题链路应恰好一轮 LLM 请求, 全部请求: {}", MockLlmProfile.server().requests().size()));
        assertTrue(titleRequests.getFirst().contains(FIRST_USER_MESSAGE), "标题 prompt 必须携带首条用户消息");
        assertTrue(titleRequests.getFirst().contains(FIRST_ASSISTANT_REPLY), "标题 prompt 必须携带首条助手回复");
    }

    @Test
    void chatSend_SecondExchange_ShouldNotRegenerateTitle()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText(FIRST_ASSISTANT_REPLY);
        chatSend(account.token(), FIRST_USER_MESSAGE);
        pollSessionTitle(account.userId());//* 首轮标题已落库 (该轮标题请求已被录制).

        //* 清空录制后二轮续聊: 标题已存在, 不得再次生成.
        final var sessionId = latestSession(account.userId()).id;
        MockLlmProfile.server().reset();
        MockLlmProfile.server().respondWithText("第二轮回复。");
        chatSend(account.token(), "继续聊聊", sessionId);

        quietWindow();
        assertTrue(titleRequests().isEmpty(), PrintUtils.quickFormat("标题已存在时不得再发标题请求, 实际全部请求: {}", MockLlmProfile.server().requests().size()));
        assertEquals(MockLlmServer.TITLE_REPLY, latestSession(account.userId()).title, "二轮后标题必须保持首轮产物不变");
    }
    //endregion

    //region ② fail-open 兜底
    @Test
    void chatSend_TitleAiFails_ShouldFallbackToTruncatedUserMessage()
    {
        final var account = PipelineUsers.register();
        final var longMessage = "最近总是睡不好, 早上又起不来, 感觉课程压力快把我压垮了";
        MockLlmProfile.server().failTitleRequests();//* 标题 LLM 请求一律 500 (模拟 AI 故障).
        MockLlmProfile.server().respondWithText(FIRST_ASSISTANT_REPLY);

        chatSend(account.token(), longMessage);

        final var session = pollSessionTitle(account.userId());
        assertEquals(longMessage.substring(0, SessionTitleGenerator.TITLE_MAX_CHARS), session.title,
            PrintUtils.quickFormat("AI 失败必须降级为首条用户消息截断 20 字, 实际: {}", session.title));
    }
    //endregion

    //region ③ 列表 VO 透传与存量容错
    @Test
    void listSessions_ShouldCarryTitleAndLegacyNull()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText(FIRST_ASSISTANT_REPLY);
        chatSend(account.token(), FIRST_USER_MESSAGE);
        pollSessionTitle(account.userId());
        //* 存量会话 (本特性上线前创建): 直插造数, 无标题, updatedAt 早于新会话 (列表按最近活跃倒序).
        seedLegacySession(account.userId(), "存量会话的旧消息");

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.CHAT_BASE + "/sessions").
            then().
            statusCode(200).
            extract().asString();

        //* 新会话: 标题透传; 存量会话: title 为 JSON null/缺席, 前端以预览兜底.
        final var items = readTree(body).path("data");
        assertTrue(items.isArray() && items.size() >= 2, PrintUtils.quickFormat("应包含新会话与存量会话两条: {}", body));
        assertEquals(MockLlmServer.TITLE_REPLY, items.path(0).path("title").asText(null), "新会话的标题必须随列表 VO 透传");
        assertTrue(items.path(1).path("title").isNull() || items.path(1).path("title").isMissingNode(),
            PrintUtils.quickFormat("存量会话标题必须为 null/缺席 (读取端容错, 不回填): {}", body));
    }
    //endregion

    //region ④ 标题归一化与兜底纯函数
    @Test
    void normalizedTitle_ShouldStripUnwrapAndCap()
    {
        assertEquals("考试周的情绪", SessionTitleGenerator.normalizedTitle("  考试周的情绪  "), "前后空白应剥离且短文原样透传");
        assertEquals("深夜的辗转", SessionTitleGenerator.normalizedTitle("\"深夜的辗转\""), "半角成对包裹引号应剥离");
        assertEquals("深夜的辗转", SessionTitleGenerator.normalizedTitle("“深夜的辗转”"), "中文弯引号成对包裹应剥离");
        assertEquals(SessionTitleGenerator.TITLE_MAX_CHARS, SessionTitleGenerator.normalizedTitle("长".repeat(30)).length(), "超长标题必须截断至 20 字封顶");
        assertNull(SessionTitleGenerator.normalizedTitle("   "), "纯空白 LLM 回复必须拒绝 (转兜底标题)");
    }

    @Test
    void fallbackTitle_ShouldStripAndCapAt20()
    {
        assertEquals("睡不着的夜", SessionTitleGenerator.fallbackTitle("  睡不着的夜  "), "兜底标题应剥离首尾空白");
        assertEquals(20, SessionTitleGenerator.fallbackTitle("压".repeat(30)).length(), "兜底标题必须截断至 20 字封顶");
    }
    //endregion

    //region 测试脚手架
    //* POST /chat/send (非流式): 与 ChatPipelineTest 同一口径; 带 sessionId 的重载供续聊用例.
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

    private static void chatSend(String token, String content, UUID sessionId)
    {
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"sessionId\":\"{}\",\"content\":\"{}\"}", sessionId, content)).
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/send").
            then().
            statusCode(200);
    }

    //* 真库直插存量会话 (无标题): 不经对话链路 (AI 依赖与本题无关), ChatPipelineTest 造数同款取舍.
    private void seedLegacySession(String userId, String messageContent)
    {
        final var session = new AiChatSession();
        session.id               = UUID.randomUUID();
        session.userId           = UUID.fromString(userId);
        session.messages         = "[{\"role\":\"user\",\"content\":\"" + messageContent + "\"}]";
        session.warningTriggered = false;
        session.updatedAt        = Instant.now().minusSeconds(3600);
        sessionFactory.withTransaction((s, tx) -> session.persist()).await().atMost(AWAIT);
    }

    //* 标题锚点请求 (标题 Agent 请求体携带标题系统提示词锚): 供轮次与取材断言.
    private static List<String> titleRequests()
    {
        return MockLlmProfile.server().requests().stream().
            filter(r -> r.contains(MockLlmServer.TITLE_ANCHOR)).
            toList();
    }

    //* 轮询等标题落库 (fire-and-forget 异步链): 超时即断言失败, 附带末次会话状态便于排障.
    private AiChatSession pollSessionTitle(String userId)
    {
        final var deadline = System.currentTimeMillis() + TITLE_POLL_DEADLINE_MS;
        var session = latestSession(userId);
        while(System.currentTimeMillis() < deadline && (session == null || session.title == null))
        {
            try { Thread.sleep(200); }
            catch(InterruptedException e) { Thread.currentThread().interrupt(); fail("标题轮询被中断"); }
            session = latestSession(userId);
        }
        assertNotNull(session, "会话应已落库");
        assertNotNull(session.title, PrintUtils.quickFormat("{}ms 内标题未落库 (fire-and-forget 链路疑似未执行)", TITLE_POLL_DEADLINE_MS));
        return session;
    }

    //* "不再生成"的静默观察窗: 给可能误触发的异步标题链留出到达时间, 之后断言零请求.
    private static void quietWindow()
    {
        try { Thread.sleep(REGEN_QUIET_WINDOW_MS); }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); fail("静默观察窗被中断"); }
    }

    //* 独立事务新开 session 查询该用户最新会话: 读已提交数据, 不受任何一级缓存干扰 (ChatPipelineTest 同款).
    private AiChatSession latestSession(String userId)
    {
        return sessionFactory.withTransaction((session, tx) ->
            session.createQuery("from AiChatSession s where s.userId = ?1 order by s.updatedAt desc", AiChatSession.class).
                setParameter(1, UUID.fromString(userId)).
                setMaxResults(1).
                getSingleResultOrNull()
        ).await().atMost(AWAIT);
    }

    private static com.fasterxml.jackson.databind.JsonNode readTree(String json)
    {
        try { return MAPPER.readTree(json); }
        catch(Exception e) { throw new AssertionError(PrintUtils.quickFormat("响应不是合法 JSON: {}", json), e); }
    }
    //endregion
}
