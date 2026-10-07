package kurvcygnus.soulnotes.domain.chat.resource;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.chat.entity.UserChatStyle;
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
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>聊天风格端点契约集成测试</b> (真库).
 * <p>钉死 Task 1 契约: {@code GET /api/v1/me/chat-style} 无行返回五轴全 default;
 * {@code PUT /api/v1/me/chat-style} 五轴白名单校验 (style 七值, 其余四轴三值), 非法一律 400,
 * 合法即幂等 upsert (user_id 主键, 重复 PUT 恒单行); 鉴权 401.</p>
 * <p>基建守卫与 {@code ChatSessionManageTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 2.1.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过聊天风格契约用例")
class ChatStyleResourceTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(20);

    @Inject Mutiny.SessionFactory sessionFactory;

    @BeforeEach
    void rearm()
    {
        //* 聊天风格表为增量建表迁移: 测试库可能未应用, 幂等补齐 (SchemaGuards 契约).
        SchemaGuards.ensureChatStyleTable(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 鉴权 (401)
    @Test void getAndPut_WithoutToken_ShouldChallenge401()
    {
        RestAssured.
            when().
            get(chatStylePath()).
            then().
            statusCode(401);
        RestAssured.
            given().
            contentType("application/json").
            body(fullBody("witty", "more", "default", "less", "less")).
            when().
            put(chatStylePath()).
            then().
            statusCode(401);
    }
    //endregion

    //region ② GET 默认 (无行返回全 default)
    @Test void get_WithoutRow_ShouldReturnAllDefaults()
    {
        final var account = PipelineUsers.register();
        final var body    = getStyle(account.token()).then().statusCode(200).extract().jsonPath();

        assertEquals(0, body.getInt("code"), PrintUtils.quickFormat("查询应成功: {}", body.prettify()));
        assertEquals("default", body.getString("data.style"),      "无行时 style 轴必须返回 default");
        assertEquals("default", body.getString("data.warmth"),     "无行时 warmth 轴必须返回 default");
        assertEquals("default", body.getString("data.enthusiasm"), "无行时 enthusiasm 轴必须返回 default");
        assertEquals("default", body.getString("data.headings"),   "无行时 headings 轴必须返回 default");
        assertEquals("default", body.getString("data.emoji"),      "无行时 emoji 轴必须返回 default");
        assertEquals(0L, countRow(UUID.fromString(account.userId())).longValue(), "无行语义必须成立: 未 PUT 前不得落库");
    }
    //endregion

    //region ③ PUT 往返 (写后读一致 + 落库形状)
    @Test void put_ThenGet_ShouldRoundTripAllFiveAxes()
    {
        final var account = PipelineUsers.register();

        final var written = putStyle(
            account.token(),
            fullBody("pragmatic", "less", "more", "more", "less")
        ).then().statusCode(200).extract().jsonPath();
        assertEquals("pragmatic", written.getString("data.style"),      "响应必须回传落定后的 style 轴");
        assertEquals("less",      written.getString("data.warmth"),     "响应必须回传落定后的 warmth 轴");
        assertEquals("more",      written.getString("data.enthusiasm"), "响应必须回传落定后的 enthusiasm 轴");
        assertEquals("more",      written.getString("data.headings"),   "响应必须回传落定后的 headings 轴");
        assertEquals("less",      written.getString("data.emoji"),      "响应必须回传落定后的 emoji 轴");

        final var read = getStyle(account.token()).then().statusCode(200).extract().jsonPath();
        assertEquals("pragmatic", read.getString("data.style"),      "GET 必须读回 PUT 落定的 style 轴");
        assertEquals("less",      read.getString("data.warmth"),     "GET 必须读回 PUT 落定的 warmth 轴");
        assertEquals("more",      read.getString("data.enthusiasm"), "GET 必须读回 PUT 落定的 enthusiasm 轴");
        assertEquals("more",      read.getString("data.headings"),   "GET 必须读回 PUT 落定的 headings 轴");
        assertEquals("less",      read.getString("data.emoji"),      "GET 必须读回 PUT 落定的 emoji 轴");

        final var row = readRow(UUID.fromString(account.userId()));
        assertNotNull(row, "PUT 必须落库");
        assertEquals("pragmatic", row.style,      "库内 style 轴必须与响应一致");
        assertEquals("less",      row.warmth,     "库内 warmth 轴必须与响应一致");
        assertEquals("more",      row.enthusiasm, "库内 enthusiasm 轴必须与响应一致");
        assertEquals("more",      row.headings,   "库内 headings 轴必须与响应一致");
        assertEquals("less",      row.emoji,      "库内 emoji 轴必须与响应一致");
        assertNotNull(row.updatedAt, "updated_at 必须随写入刷新");
    }
    //endregion

    //region ④ 白名单校验 (400)
    @Test void put_IllegalAxisValue_ShouldReturn400()
    {
        final var account = PipelineUsers.register();
        final var token   = account.token();

        //* style 轴七值白名单之外的取值一律 400.
        putStyle(token, fullBody("sarcastic", "default", "default", "default", "default")).then().statusCode(400);
        //* 四轴三值白名单之外的取值一律 400 (逐轴探针).
        putStyle(token, fullBody("default", "extreme", "default", "default", "default")).then().statusCode(400);
        putStyle(token, fullBody("default", "default", "extreme", "default", "default")).then().statusCode(400);
        putStyle(token, fullBody("default", "default", "default", "extreme", "default")).then().statusCode(400);
        putStyle(token, fullBody("default", "default", "default", "default", "extreme")).then().statusCode(400);
        //* 缺字段 (null) 同样不在白名单内: 400 而非 500/NPE.
        putStyle(token, "{\"style\":\"witty\"}").then().statusCode(400);

        //* 校验失败绝不落库: 全 400 后仍为无行形态.
        assertNull(readRow(UUID.fromString(account.userId())), "非法请求不得落库");
    }
    //endregion

    //region ⑤ 幂等 upsert (重复 PUT 恒单行)
    @Test void put_Twice_ShouldUpsertSingleRow()
    {
        final var account = PipelineUsers.register();

        putStyle(account.token(), fullBody("witty", "more", "default", "default", "less")).then().statusCode(200);
        putStyle(account.token(), fullBody("professional", "default", "less", "default", "default")).then().statusCode(200);

        final var read = getStyle(account.token()).then().statusCode(200).extract().jsonPath();
        assertEquals("professional", read.getString("data.style"),      "后一次 PUT 必须生效 (style 轴)");
        assertEquals("less",         read.getString("data.enthusiasm"), "后一次 PUT 必须生效 (enthusiasm 轴)");
        assertEquals(1L, countRow(UUID.fromString(account.userId())).longValue(), "重复 PUT 必须收敛为单行 (主键 upsert)");
    }
    //endregion

    //region 测试脚手架
    private static String chatStylePath() { return ApiEndpointConstants.ME_BASE + "/chat-style"; }

    private static String fullBody(String style, String warmth, String enthusiasm, String headings, String emoji)
    {
        //* quickFormat (SLF4J arrayFormat) 只替换 "{}" 占位符: 单个花括号键名原样保留, 五个 "{}" 恰为五个值位.
        return PrintUtils.quickFormat(
            "{\"style\":\"{}\",\"warmth\":\"{}\",\"enthusiasm\":\"{}\",\"headings\":\"{}\",\"emoji\":\"{}\"}",
            style, warmth, enthusiasm, headings, emoji
        );
    }

    private static Response getStyle(String token)
    {
        return RestAssured.given().header("Authorization", PipelineUsers.bearer(token)).when().get(chatStylePath());
    }

    //* PUT (裸形态取响应, 供 400/鉴权分支断言): 收裸 token, 内部包裹 Bearer.
    private static Response putStyle(String token, String body)
    {
        return RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(body).
            when().
            put(chatStylePath());
    }

    //* 独立事务重读风格行 (落库形状断言): 读已提交数据, 不受一级缓存干扰.
    private UserChatStyle readRow(UUID userId)
    {
        return sessionFactory.withTransaction((session, tx) -> UserChatStyle.<UserChatStyle>findById(userId)).await().atMost(AWAIT);
    }

    //* 行数统计 (幂等 upsert 断言): user_id 主键下恒 <= 1.
    private Long countRow(UUID userId)
    {
        return sessionFactory.withTransaction((session, tx) ->
            session.createQuery("select count(u) from UserChatStyle u where u.userId = ?1", Long.class).
                setParameter(1, userId).
                getSingleResult()
        ).await().atMost(AWAIT);
    }
    //endregion
}
