package kurvcygnus.soulnotes.domain.summary;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.hibernate.reactive.mutiny.Mutiny;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@code /api/v1/summary} 契约集成测试</b> (真库).
 * <p>钉死前端"每日絮语"卡的数据契约: 今日无总结时 {@code data} 键整体缺席 (而非空对象 —
 * ApiResponse NON_NULL 序列化契约); recent 列表按日期倒序且 limit 生效.</p>
 * <p>结构断言在 {@code DailySummaryResourceTest} (纯 JUnit) 分置.</p>
 * @since 1.5.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过每日总结契约真库用例")
class DailySummaryResourceContractTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(20);

    @Inject Mutiny.SessionFactory sessionFactory;

    @BeforeEach void prepare() { ensureDailySummarySchema(); }

    //region 今日总结
    //* 今日无总结: data 键必须缺席而非空对象 — 前端以 data 判空显示降级文案, 空对象会被误判为"有数据".
    @Test void daily_NoRow_ShouldReturnEnvelopeWithoutData()
    {
        final var account = PipelineUsers.register();

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.SUMMARY_BASE + "/daily").
            then().
            statusCode(200).
            body("code", equalTo(0)).
            body("message", equalTo("success")).
            extract().jsonPath();

        assertNull(body.get("data"), PrintUtils.quickFormat("今日无总结时 data 键必须缺席, 实际: {}", body.prettify()));
    }

    @Test void daily_SeededToday_ShouldReturnTodaySummary()
    {
        final var account = PipelineUsers.register();
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI);
        seedSummary(UUID.fromString(account.userId()), today, "今天整体平稳, 睡前散步十分钟");
        seedSummary(UUID.fromString(account.userId()), today.minusDays(1), "昨天的一份总结");

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.SUMMARY_BASE + "/daily").
            then().
            statusCode(200).
            body("code", equalTo(0)).
            extract().jsonPath();

        assertEquals("今天整体平稳, 睡前散步十分钟", body.get("data.content"), "daily 端点必须只回今日行");
        assertEquals(today.toString(), body.get("data.date"));
    }
    //endregion

    //region 近程列表
    @Test void recent_NoRow_ShouldReturnEmptyArray()
    {
        final var account = PipelineUsers.register();

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.SUMMARY_BASE + "/recent").
            then().
            statusCode(200).
            body("code", equalTo(0)).
            extract().jsonPath();

        final List<?> data = body.get("data");
        assertNotNull(data, "recent 无数据时必须回空数组而非缺席 (前端按 size 判空)");
        assertEquals(0, data.size());
    }

    @Test void recent_ShouldOrderByDateDescAndHonorLimit()
    {
        final var account = PipelineUsers.register();
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI);
        seedSummary(UUID.fromString(account.userId()), today.minusDays(2), "前天");
        seedSummary(UUID.fromString(account.userId()), today.minusDays(1), "昨天");
        seedSummary(UUID.fromString(account.userId()), today, "今天");

        final var all = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get(ApiEndpointConstants.SUMMARY_BASE + "/recent").
            then().
            statusCode(200).
            extract().jsonPath();

        assertEquals(3, all.<List<?>>get("data").size());
        assertEquals("今天", all.get("data[0].content"), "recent 必须按日期倒序 (最新在前)");
        assertEquals("昨天", all.get("data[1].content"));

        final var limited = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            queryParam("limit", 1).
            when().
            get(ApiEndpointConstants.SUMMARY_BASE + "/recent").
            then().
            statusCode(200).
            extract().jsonPath();

        assertEquals(1, limited.<List<?>>get("data").size(), "limit 参数必须生效");
        assertEquals("今天", limited.get("data[0].content"));
    }
    //endregion

    //region 测试脚手架
    //* 真库直插总结行: 生成链路 (LLM) 与查询契约 (本题) 正交, 造数不经生成器 (DiaryListContractTest 取舍).
    private void seedSummary(UUID userId, LocalDate date, String content)
    {
        final var summary = new DailySummaryEntity();
        summary.id        = UUID.randomUUID();
        summary.userId    = userId;
        summary.date      = date;
        summary.content   = content;
        summary.createdAt = Instant.now();
        sessionFactory.withTransaction((s, tx) -> summary.persist()).await().atMost(AWAIT);
    }

    //* 真库前置: dev 库可能尚未应用 06 号迁移, 幂等确保 daily_summaries 表存在 (ClinicalPipelineTest 同款).
    private void ensureDailySummarySchema()
    {
        final var ddls = schemaStatements("/db/schema/06_daily_summaries.sql");
        sessionFactory.withSession(session ->
        {
            io.smallrye.mutiny.Uni<Void> chain = io.smallrye.mutiny.Uni.createFrom().voidItem();
            for(final var ddl: ddls)
                chain = chain.chain(v -> session.createNativeQuery(ddl).executeUpdate().replaceWithVoid());
            return chain;
        }).await().atMost(AWAIT);
    }

    /**
     * 读取 classpath 下的建表脚本并拆为语句列表: 剥离 {@code --} 注释行, 按分号切分
     * (ClinicalPipelineTest 同款).
     */
    private static List<String> schemaStatements(String resource)
    {
        try(var stream = Objects.requireNonNull(
                DailySummaryResourceContractTest.class.getResourceAsStream(resource),
                PrintUtils.quickFormat("classpath 资源缺失: {}", resource));
            var reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8)))
        {
            final var sql = reader.lines().
                filter(line -> !line.strip().startsWith("--")).
                reduce("", (left, right) -> left + "\n" + right);
            final var statements = new ArrayList<String>();
            for(final var part: sql.split(";"))
            {
                if(!part.isBlank())
                    statements.add(part.strip());
            }
            return statements;
        }
        catch(IOException e) { throw new IllegalStateException(PrintUtils.quickFormat("schema 脚本读取失败: {}", resource), e); }
    }
    //endregion
}
