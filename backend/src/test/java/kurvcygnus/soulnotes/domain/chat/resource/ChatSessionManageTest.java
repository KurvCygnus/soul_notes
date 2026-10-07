package kurvcygnus.soulnotes.domain.chat.resource;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.domain.chat.service.SessionTitleBackfiller;
import kurvcygnus.soulnotes.domain.chat.service.SessionTitleGenerator;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
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
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>会话置顶/重命名端点契约集成测试</b> (Mock-LLM 驱动, 真库).
 * <p>钉死 Task 6 前端已按形状消费的契约: {@code POST /sessions/{id}/pin} 服务端按当前态翻转并回传
 * 翻转后的 {@code pinnedAt} (null = 已取消); {@code PUT /sessions/{id}/title} 校验非空且不超 100 字,
 * 成功即落库且 {@code title_source='manual'}; 会话列表 VO 透传 {@code pinnedAt}.</p>
 * <p>标题链豁免: 手动重命名后的会话对启动回填与 LLM 标题生成双闸门豁免 — 标题链永不覆写人工标题.</p>
 * <p>基建守卫与 {@code ChatPipelineTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 1.9.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过会话置顶/重命名契约用例")
class ChatSessionManageTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(20);
    //* "不再生成"的静默观察窗: 二轮发送返回后, 若误触发标题生成, LLM 请求在秒级内必达 mock (ChatSessionTitleTest 同窗).
    private static final long REGEN_QUIET_WINDOW_MS = 3_000;

    private static final String RENAMED_TITLE        = "我的深夜树洞";
    private static final String FIRST_USER_MESSAGE   = "最近总是睡不好";
    private static final String FIRST_ASSISTANT_REPLY = "愿意说出来, 已经很有勇气了.";

    @Inject Mutiny.SessionFactory sessionFactory;
    @Inject SessionTitleGenerator sessionTitleGenerator;
    @Inject SessionTitleBackfiller sessionTitleBackfiller;

    @BeforeEach
    void rearm()
    {
        //* 重命名端点写 title 列, 置顶/来源两列由本 Task 迁移: 双守卫幂等补齐 (开发库/CI 库增量口径).
        SchemaGuards.ensureChatSessionTitleColumn(sessionFactory);
        SchemaGuards.ensureChatSessionPinRenameColumns(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 鉴权 (401)
    @Test void pinAndRename_WithoutToken_ShouldChallenge401()
    {
        RestAssured.
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/sessions/" + UUID.randomUUID() + "/pin").
            then().
            statusCode(401);
        RestAssured.
            given().
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"title\":\"{}\"}", RENAMED_TITLE)).
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + UUID.randomUUID() + "/title").
            then().
            statusCode(401);
    }
    //endregion

    //region ② 置顶翻转语义
    @Test void pin_ToggleSemantics_ShouldFlipPinnedAtBothWays()
    {
        final var account = PipelineUsers.register();
        final var session = seedSession(account.userId());

        //* 翻上: 未置顶 -> 置顶, 响应回传服务端翻转产物 (前端不自行推断, 一律以响应落定).
        final var pinned = pinSession(account.token(), session.id);
        assertEquals(0, pinned.getInt("code"), PrintUtils.quickFormat("翻转应成功: {}", pinned.prettify()));
        final var pinnedAt = pinned.get("data.pinnedAt");
        assertNotNull(pinnedAt, PrintUtils.quickFormat("置顶后 data.pinnedAt 必须为非空 ISO 时刻: {}", pinned.prettify()));
        //* 库侧 timestamptz 为微秒精度: 响应 (内存 Instant, 纳秒) 截到微秒后与库值逐位一致.
        assertEquals(
            pinnedSession(account.userId()).pinnedAt,
            Instant.parse(pinnedAt.toString()).truncatedTo(ChronoUnit.MICROS),
            "库内置顶时刻必须与响应一致"
        );

        //* 翻下: 再翻转即取消, 回传 null (NON_NULL 序列化下缺席), 库内清空.
        final var unpinned = pinSession(account.token(), session.id);
        assertEquals(0, unpinned.getInt("code"), PrintUtils.quickFormat("再翻转应成功: {}", unpinned.prettify()));
        assertNull(unpinned.get("data.pinnedAt"), PrintUtils.quickFormat("取消置顶后 data.pinnedAt 必须为 null/缺席: {}", unpinned.prettify()));
        assertNull(pinnedSession(account.userId()).pinnedAt, "取消置顶后库内置顶时刻必须清空");

        //* 防枚举: 不存在/越权一律 404 同码同文案 (与既有会话端点同语义), 不泄露存在性.
        final var foreign = PipelineUsers.register();
        pinRaw(account.token(), UUID.randomUUID()).then().statusCode(404);
        pinRaw(foreign.token(), session.id).then().statusCode(404);
    }

    @Test void listSessions_ShouldCarryPinnedAtPerSession()
    {
        final var account = PipelineUsers.register();
        final var pinned   = seedSession(account.userId());
        final var unpinned = seedSession(account.userId());
        markPinned(pinned.id);

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.CHAT_BASE + "/sessions").
            then().
            statusCode(200).
            extract().asString();

        final var items = new JsonPath(body).get("data");
        assertTrue(items.toString().contains(pinned.id.toString()), PrintUtils.quickFormat("列表必须含置顶会话: {}", body));
        //* 逐会话透传: 置顶行携带时刻, 未置顶行为 null/缺席 (NON_NULL), 前端据此二分 "置顶" 节.
        assertNotNull(readPinnedAt(body, pinned.id), PrintUtils.quickFormat("置顶会话的列表条目必须携带 pinnedAt: {}", body));
        assertNull(readPinnedAt(body, unpinned.id), PrintUtils.quickFormat("未置顶会话的列表条目 pinnedAt 必须为 null/缺席: {}", body));
    }
    //endregion

    //region ③ 重命名校验与落库
    @Test void rename_BlankOrOverlongTitle_ShouldReturn400()
    {
        final var account = PipelineUsers.register();
        //* 校验先于会话寻址: 空标题 (含纯空白) 与超 100 字一律 400, 任意会话 ID 均可触发.
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            contentType("application/json").
            body("{\"title\":\"   \"}").
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + UUID.randomUUID() + "/title").
            then().
            statusCode(400);
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"title\":\"{}\"}", "长".repeat(101))).
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + UUID.randomUUID() + "/title").
            then().
            statusCode(400);
    }

    //* Task 8 顺修回归: JSON null 标题 ({"title":null}) 必须以 400 形态拒绝, 而非 NPE 落 500 —
    //* 服务端 renameSession 在 strip 前做 null 检查 (与空白标题同码同文案).
    @Test void rename_NullTitle_ShouldReturn400()
    {
        final var account = PipelineUsers.register();
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            contentType("application/json").
            body("{\"title\":null}").
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + UUID.randomUUID() + "/title").
            then().
            statusCode(400);
    }

    @Test void rename_Success_ShouldPersistTitleAndMarkManual()
    {
        final var account = PipelineUsers.register();
        final var session = seedSession(account.userId());

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"title\":\"  {}  \"}", RENAMED_TITLE)).
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + session.id + "/title").
            then().
            statusCode(200).
            extract().jsonPath();

        assertEquals(0, body.getInt("code"), PrintUtils.quickFormat("重命名应成功: {}", body.prettify()));
        final var latest = latestSession(account.userId());
        assertEquals(RENAMED_TITLE, latest.title, "服务端必须剥离首尾空白后落库标题");
        assertEquals(AiChatSession.TITLE_SOURCE_MANUAL, latest.titleSource, "重命名必须落 title_source='manual' (标题链豁免依据)");

        //* 防枚举: 不存在的会话 404 (合法标题才走到寻址, 与防枚举语义一致).
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"title\":\"{}\"}", RENAMED_TITLE)).
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + UUID.randomUUID() + "/title").
            then().
            statusCode(404);
    }
    //endregion

    //region ④ 标题链豁免 (手动标题永不覆写)
    @Test void rename_ManualSession_ShouldBeExemptFromStartupBackfill()
    {
        final var account = PipelineUsers.register();
        final var session = seedSession(account.userId());
        rename(account.token(), session.id);

        //* 制造"manual 行 + 无标题"形态 (仅 DB 手术可达): 若回填器未豁免 manual, 会以首条用户消息兜底覆写.
        clearTitle(session.id);
        final var written = sessionTitleBackfiller.backfillOnce().await().atMost(AWAIT);
        assertTrue(written >= 0, "回填链应正常完成");
        final var latest = latestSession(account.userId());
        assertNull(latest.title, PrintUtils.quickFormat("manual 会话必须被启动回填豁免, 实际标题: {}", latest.title));
        assertEquals(AiChatSession.TITLE_SOURCE_MANUAL, latest.titleSource, "豁免不得篡改 title_source");
    }

    @Test void rename_ManualSession_ShouldBeExemptFromTitleGeneration()
    {
        final var account = PipelineUsers.register();
        final var session = seedSession(account.userId());
        rename(account.token(), session.id);
        clearTitle(session.id);

        //* mock LLM 正常返回标题产物: 豁免闸门必须在不依赖"标题已非空"的前提下独立拦住写入.
        sessionTitleGenerator.generateFor(session.id, FIRST_USER_MESSAGE, FIRST_ASSISTANT_REPLY).await().atMost(AWAIT);
        final var latest = latestSession(account.userId());
        assertNull(latest.title, PrintUtils.quickFormat("manual 会话必须被 LLM 标题生成豁免, 实际标题: {}", latest.title));
        assertEquals(AiChatSession.TITLE_SOURCE_MANUAL, latest.titleSource, "豁免不得篡改 title_source");
    }

    @Test void chat_AfterManualRename_TitleKeepsManualValue()
    {
        final var account = PipelineUsers.register();
        MockLlmProfile.server().respondWithText(FIRST_ASSISTANT_REPLY);
        chatSend(account.token(), FIRST_USER_MESSAGE, null);
        final var session = pollSessionTitle(account.userId());
        rename(account.token(), session.id);

        //* 二轮续聊: 标题链不得以任何形式覆写人工标题 (二轮非首轮本就不触发, 静默窗兜住误触发).
        MockLlmProfile.server().reset();
        MockLlmProfile.server().respondWithText("第二轮回复。");
        chatSend(account.token(), "继续聊聊", session.id);
        quietWindow();

        final var latest = latestSession(account.userId());
        assertEquals(RENAMED_TITLE, latest.title, PrintUtils.quickFormat("手动重命名后标题必须保持不变, 实际: {}", latest.title));
        assertEquals(AiChatSession.TITLE_SOURCE_MANUAL, latest.titleSource, "手动语义必须跨轮保持");
    }
    //endregion

    //region 测试脚手架
    //* 真库直插存量会话 (带一条用户消息, 供回填兜底取材): 不经对话链路, ChatPipelineTest 造数同款取舍.
    private AiChatSession seedSession(String userId)
    {
        final var session = new AiChatSession();
        session.id               = UUID.randomUUID();
        session.userId           = UUID.fromString(userId);
        //* JSON 字面量以字符串拼接构造 (quickFormat 的 {} 占位语义会把 {"..."} 里的花括号原样输出, 不适合拼 JSON).
        session.messages         = "[{\"role\":\"user\",\"content\":\"" + FIRST_USER_MESSAGE + "\"}]";
        session.warningTriggered = false;
        session.updatedAt        = Instant.now();
        sessionFactory.withTransaction((s, tx) -> session.persist()).await().atMost(AWAIT);
        return session;
    }

    //* 直改库内置顶时刻 (列表 VO 透传用例的置顶行造数): 不经端点, 隔离端点行为断言.
    private void markPinned(UUID sessionId)
    {
        sessionFactory.withTransaction((session, tx) ->
            session.createMutationQuery("update AiChatSession s set s.pinnedAt = :at where s.id = :id").
                setParameter("at", Instant.now()).
                setParameter("id", sessionId).
                executeUpdate().
                replaceWithVoid()
        ).await().atMost(AWAIT);
    }

    //* 直清标题 (豁免用例的 "manual 行 + 无标题" 形态制造): HQL 更新绕开实体快照.
    private void clearTitle(UUID sessionId)
    {
        sessionFactory.withTransaction((session, tx) ->
            session.createMutationQuery("update AiChatSession s set s.title = null where s.id = :id").
                setParameter("id", sessionId).
                executeUpdate().
                replaceWithVoid()
        ).await().atMost(AWAIT);
    }

    private static JsonPath pinSession(String token, UUID sessionId)
    {
        return pinRaw(token, sessionId).then().statusCode(200).extract().jsonPath();
    }

    //* POST /pin 裸形态: 供 404 防枚举分支取状态码.
    private static Response pinRaw(String token, UUID sessionId)
    {
        return RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/sessions/" + sessionId + "/pin");
    }

    //* PUT /title (经端点, 豁免用例的 manual 语义来源): 200 即已提交.
    private static void rename(String token, UUID sessionId)
    {
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"title\":\"{}\"}", RENAMED_TITLE)).
            when().
            put(ApiEndpointConstants.CHAT_BASE + "/sessions/" + sessionId + "/title").
            then().
            statusCode(200);
    }

    //* POST /chat/send (非流式): ChatSessionTitleTest 同口径; sessionId 为 null 即新会话.
    private static void chatSend(String token, String content, UUID sessionId)
    {
        final var payload = sessionId == null ?
            PrintUtils.quickFormat("{\"content\":\"{}\"}", content) :
            PrintUtils.quickFormat("{\"sessionId\":\"{}\",\"content\":\"{}\"}", sessionId, content);
        RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(payload).
            when().
            post(ApiEndpointConstants.CHAT_BASE + "/send").
            then().
            statusCode(200);
    }

    //* 独立事务新开 session 查询该用户最新会话: 读已提交数据, 不受一级缓存干扰 (ChatSessionTitleTest 同款).
    private AiChatSession latestSession(String userId)
    {
        return sessionFactory.withTransaction((session, tx) ->
            session.createQuery("from AiChatSession s where s.userId = ?1 order by s.updatedAt desc", AiChatSession.class).
                setParameter(1, UUID.fromString(userId)).
                setMaxResults(1).
                getSingleResultOrNull()
        ).await().atMost(AWAIT);
    }

    //* 按会话 ID 重读置顶时刻 (翻转语义断言用): 与列表 VO 无关的库内事实.
    private AiChatSession pinnedSession(String userId) { return latestSession(userId); }

    //* 从列表响应提取指定会话条目的 pinnedAt (缺席视作 null, 对齐 NON_NULL 契约).
    private static Object readPinnedAt(String body, UUID sessionId)
    {
        final var json = new JsonPath(body);
        final var count = json.getInt("data.size()");
        for(var i = 0; i < count; i++)
            if(sessionId.toString().equals(json.getString(PrintUtils.quickFormat("data[{}].sessionId", i))))
                return json.get(PrintUtils.quickFormat("data[{}].pinnedAt", i));
        return null;
    }

    //* 轮询等标题落库 (fire-and-forget 异步链): 超时即断言失败 (ChatSessionTitleTest 同款).
    private AiChatSession pollSessionTitle(String userId)
    {
        final var deadline = System.currentTimeMillis() + 20_000;
        var session = latestSession(userId);
        while(System.currentTimeMillis() < deadline && (session == null || session.title == null))
        {
            try { Thread.sleep(200); }
            catch(InterruptedException e) { Thread.currentThread().interrupt(); fail("标题轮询被中断"); }
            session = latestSession(userId);
        }
        assertNotNull(session, "会话应已落库");
        assertNotNull(session.title, "20s 内标题未落库 (fire-and-forget 链路疑似未执行)");
        return session;
    }

    //* "不再生成"的静默观察窗 (ChatSessionTitleTest 同款).
    private static void quietWindow()
    {
        try { Thread.sleep(REGEN_QUIET_WINDOW_MS); }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); fail("静默观察窗被中断"); }
    }
    //endregion
}
