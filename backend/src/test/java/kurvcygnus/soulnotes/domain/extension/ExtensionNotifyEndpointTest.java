package kurvcygnus.soulnotes.domain.extension;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.constants.RedisKeyConstants;
import org.hibernate.reactive.mutiny.Mutiny;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.time.Duration;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>扩展通知开关端点契约集成测试</b> (P3 Task 1, Mock-LLM 驱动, 真库真 Redis).
 * <p>钉死 {@code PUT /api/v1/ext/{name}/notify} 契约: 鉴权 401; 未知名 404 (extName 校验);
 * {@code {"enabled":true}} 落 Redis 开关键 ("1", TTL 永久), {@code false} 删除开关键 (默认关语义);
 * body 缺 {@code enabled} 字段 400.</p>
 * <p>基建守卫与 {@code ChatPipelineTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 2.2.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过扩展通知开关端点用例")
class ExtensionNotifyEndpointTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(10);

    @Inject ReactiveRedisDataSource redisDS;
    @Inject Mutiny.SessionFactory sessionFactory;

    //region ① 鉴权与寻址
    @Test void notify_WithoutToken_ShouldChallenge401()
    {
        given().
            contentType("application/json").
            body("{\"enabled\":true}").
            when().
            put(notifyPath("timetable")).
            then().
            statusCode(401);
    }

    @Test void notify_UnknownExtension_ShouldReturn404()
    {
        final var account = PipelineUsers.register();
        put(account.token(), "no-such-ext", "{\"enabled\":true}").then().statusCode(404);
    }
    //endregion

    //region ② 开关读写
    @Test void notify_Toggle_ShouldWriteAndRemoveRedisSwitch()
    {
        final var account = PipelineUsers.register();
        final var key = RedisKeyConstants.EXT_NOTIFY_SWITCH.formatted(account.userId(), "timetable");
        try
        {
            put(account.token(), "timetable", "{\"enabled\":true}").then().statusCode(200);
            assertEquals("1", redisDS.value(String.class).get(key).await().atMost(AWAIT), "开启后 Redis 开关键必须为 \"1\"");

            put(account.token(), "timetable", "{\"enabled\":false}").then().statusCode(200);
            assertNull(redisDS.value(String.class).get(key).await().atMost(AWAIT), "关闭后 Redis 开关键必须删除 (缺席 = 默认关)");
        }
        finally { redisDS.key().del(key).await().atMost(AWAIT); }
    }
    //endregion

    //region ③ 负载校验
    @Test void notify_MissingOrNullEnabled_ShouldReturn400()
    {
        final var account = PipelineUsers.register();
        put(account.token(), "timetable", "{}").then().statusCode(400);
        put(account.token(), "timetable", "{\"enabled\":null}").then().statusCode(400);
    }
    //endregion

    //region ④ 角色放行 (C1 治理视角)
    //* C1 双裁定后扩展页收归 ADMIN 治理视角 (前端 RequireAdmin): REST 若仍仅 STUDENT,
    //! 唯一能进页面的角色将 403 自降级拿空数据 — 此处钉死 ADMIN 放行契约 (ExtensionResource 类注解).
    @Test void ext_AdminRole_ShouldReadAndToggle()
    {
        final var account = PipelineUsers.register();
        //* register 端点恒发 STUDENT (AuthResource 门禁), 直库提升 ADMIN 后重登, 换取 groups=[ADMIN] 的新 JWT.
        sessionFactory.withTransaction((session, tx) ->
            session.createNativeQuery("UPDATE users SET role = 'ADMIN' WHERE user_name = :name")
                .setParameter("name", account.username())
                .executeUpdate()
        ).await().atMost(AWAIT);
        final String adminToken = given().
            contentType("application/json").
            body(PrintUtils.quickFormat("{\"username\":\"{}\",\"password\":\"pipeline-pass-123\"}", account.username())).
            when().
            post(AuthPath).
            then().
            statusCode(200).
            extract().path("data.token");

        given().
            header("Authorization", PipelineUsers.bearer(adminToken)).
            when().
            get(EXT_BASE).
            then().
            statusCode(200);
        put(adminToken, "timetable", "{\"enabled\":true}").then().statusCode(200);
    }
    //endregion

    //region 测试脚手架
    //* 端点路径 (EXT_BASE + /{name}/notify): 契约改动单点.
    private static final String EXT_BASE = ApiEndpointConstants.EXT_BASE;
    private static final String AuthPath = ApiEndpointConstants.AUTH_BASE + "/login";

    private static String notifyPath(String name) { return ApiEndpointConstants.EXT_BASE + "/" + name + "/notify"; }

    private static Response put(String token, String name, String body)
    {
        return given().
            header("Authorization", PipelineUsers.bearer(token)).
            contentType("application/json").
            body(body).
            when().
            put(notifyPath(name));
    }
    //endregion
}
