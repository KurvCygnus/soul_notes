package kurvcygnus.soulnotes.domain.summary;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.auth.entity.User;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>每日总结 fail-open 集成测试</b> (LLM 失联场景, 真库).
 * <p>Spec §8 离线安全网语义: LLM 不可达时 {@code generateFor} 绝不向外抛错 (WARN 留痕即止),
 * 也不落出半途行 — 查询端点照常返回"今日无总结", 前端卡片安静降级.</p>
 * <p>Profile 经 {@code SummaryLlmOutageProfile} 把 base-url 指向死端口模拟 AI 服务失联.</p>
 * @since 1.5.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(SummaryLlmOutageProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过每日总结 fail-open 用例")
class DailySummaryGeneratorOutageTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(20);

    //* 类级随机后缀 (UUID 前 8 位): 同一 JVM 运行内共享账号, 跨次运行不撞 users.user_name UNIQUE 约束.
    private static final String SUFFIX = UUID.randomUUID().toString().substring(0, 8);

    @Inject DailySummaryGenerator generator;
    @Inject Mutiny.SessionFactory sessionFactory;

    private final Map<String, User> users = new HashMap<>();

    @BeforeEach void prepare() { ensureDailySummarySchema(); }

    @Test
    void generateFor_LlmOutage_ShouldFailOpenWithoutThrowOrRow()
    {
        final var user = ensureUser("outage");
        final var session = new kurvcygnus.soulnotes.domain.chat.entity.AiChatSession();
        session.id               = UUID.randomUUID();
        session.userId           = user.id;
        session.messages         = "[{\"role\":\"user\",\"content\":\"AI 挂了也要有安全网\"}]";
        session.warningTriggered = false;
        session.updatedAt        = Instant.now();
        sessionFactory.withTransaction((s, tx) -> session.persist()).await().atMost(AWAIT);

        assertDoesNotThrow(
            () -> generator.generateFor(user.id, LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI)).await().atMost(AWAIT),
            "LLM 失联时 fail-open: generateFor 绝不向外抛错");

        final var stored = sessionFactory.withTransaction((s, tx) ->
            s.createQuery("from DailySummaryEntity e where e.userId = ?1", kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity.class).
                setParameter(1, user.id).
                getResultList()
        ).await().atMost(AWAIT);
        assertTrue(stored.isEmpty(), PrintUtils.quickFormat("LLM 失联不得落出总结行, 实际: {}", stored.size()));
    }

    //region 测试脚手架
    /**
     * 确保角色账号存在并返回实体: 独立事务按用户名查重, 缺席则以 {@code User.create} 工厂落库
     * (ClinicalPipelineTest 同款模式).
     */
    private User ensureUser(String rolePrefix)
    {
        return users.computeIfAbsent(rolePrefix, k ->
        {
            final var username = PrintUtils.quickFormat("summary-outage-{}-{}", rolePrefix, SUFFIX);
            return sessionFactory.withTransaction((session, tx) ->
                User.findByUsername(username).
                    onItem().ifNull().switchTo(() ->
                    {
                        final var user = User.create(username, "it-not-a-real-hash", kurvcygnus.soulnotes.utils.enums.UserRole.STUDENT);
                        return user.persist().replaceWith(user);
                    })
            ).await().atMost(AWAIT);
        });
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
                DailySummaryGeneratorOutageTest.class.getResourceAsStream(resource),
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
