package kurvcygnus.soulnotes.domain.summary;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import kurvcygnus.soulnotes.domain.auth.entity.User;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.domain.diary.entity.MoodDiary;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import jakarta.inject.Inject;
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
 * <b>每日总结生成链路集成测试</b> (Mock-LLM 驱动, 真库).
 * <p>覆盖 Spec §8 核心契约: prompt 必须同时携带会话摘录与情绪分析两类输入;
 * 同日重跑覆写不重复落行 (每用户每日一次); 空输入静默跳过 (零 LLM 调用零落库);
 * 活跃窗聚合只收近 7 天活跃用户; 落库内容截断封顶; 调度 cron 契约.</p>
 * <p>LLM 故障的 fail-open 语义在 {@code DailySummaryGeneratorOutageTest} (独立 Profile 指向失联端点) 分置.</p>
 * @since 1.5.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过每日总结生成链路用例")
class DailySummaryGeneratorTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(20);

    //* 断言锚点: prompt 锚钉死系统提示词在场 (mock 无工具请求返回预警 JSON, 响应文本无断言价值, 输入侧才是契约),
    //* 会话/分析锚为造数标记文本, 经请求体全文匹配验证两类输入确实进入 prompt.
    private static final String PROMPT_ANCHOR   = "睡前留言";
    private static final String SESSION_MARKER  = "图书馆闭馆时还在赶实验报告";
    private static final String ANALYSIS_MARKER = "整体情绪平稳, 偶有小波动";
    private static final String ANALYSIS_JSON =
        "{\"positive\":0.6,\"negative\":0.2,\"anxiety\":0.3,\"weather\":\"cloudy\",\"summary\":\"" + ANALYSIS_MARKER + "\",\"warningLevel\":\"NONE\"}";

    //* 类级随机后缀 (UUID 前 8 位): 同一 JVM 运行内共享账号, 跨次运行不撞 users.user_name UNIQUE 约束.
    private static final String SUFFIX = UUID.randomUUID().toString().substring(0, 8);

    @Inject DailySummaryGenerator generator;
    @Inject Mutiny.SessionFactory sessionFactory;

    private final Map<String, User> users = new HashMap<>();

    @BeforeEach void prepare()
    {
        ensureDailySummarySchema();
        //* 用例隔离: 清空 mock 录制与编程状态, 防止跨用例的请求累积干扰断言 (ChatPipelineTest rearm 先例).
        MockLlmProfile.server().reset();
    }

    //region ① prompt 携带双输入 + 落库
    @Test
    void generateFor_PromptContainsSessionAndAnalysis_ShouldPersistTodayRow()
    {
        final var user = ensureUser("gen-full");
        seedSession(user.id, SESSION_MARKER);
        seedDiary(user.id, ANALYSIS_JSON);

        assertDoesNotThrow(() -> generator.generateFor(user.id, today()).await().atMost(AWAIT));

        //* mock 无工具请求恒返回预警 JSON (MockLlmServer 契约), 响应文本无断言价值:
        //* 请求体必须同时携带会话文本与情绪分析输入, 且以每日总结系统提示词发起 (恰好一轮).
        final var requests = MockLlmProfile.server().requests().stream().
            filter(r -> r.contains(PROMPT_ANCHOR)).
            toList();
        assertEquals(1, requests.size(), PrintUtils.quickFormat("每日总结应恰好一轮 LLM 请求, 全部请求: {}", MockLlmProfile.server().requests().size()));
        assertTrue(requests.getFirst().contains(SESSION_MARKER), "请求体必须包含最近会话消息摘录");
        assertTrue(requests.getFirst().contains(ANALYSIS_MARKER), "请求体必须包含最近情绪分析结果");
        //* 机构侧信息不回流: 预警字段 (warningLevel/warningReason) 属机构侧, 摘记侧有意排除,
        //* 用户可见的 prompt 不得携带 (digestAnalysis 契约, fix round: review Finding 3).
        assertFalse(requests.getFirst().contains("warningLevel"), "prompt 严禁携带预警字段 (机构侧信息不回流用户可见文案)");

        final var stored = storedSummary(user.id);
        assertNotNull(stored, "当日总结应已落库");
        assertFalse(stored.content.isBlank(), "落库内容不得为空串");
    }
    //endregion

    //region ② 同日重跑覆写
    @Test
    void generateFor_RerunSameDay_ShouldOverwriteToSingleRow()
    {
        final var user = ensureUser("gen-rerun");
        seedSession(user.id, SESSION_MARKER);
        seedDiary(user.id, ANALYSIS_JSON);

        assertDoesNotThrow(() -> generator.generateFor(user.id, today()).await().atMost(AWAIT));
        assertDoesNotThrow(() -> generator.generateFor(user.id, today()).await().atMost(AWAIT));

        final var rows = storedSummaryRows(user.id);
        assertEquals(1, rows.size(), PrintUtils.quickFormat("同日重跑必须覆写为单行 (每用户每日一次), 实际: {}", rows.size()));
    }
    //endregion

    //region ③ 空输入静默跳过
    @Test
    void generateFor_NoInputs_ShouldSkipLlmCallAndRow()
    {
        final var user = ensureUser("gen-empty");

        assertDoesNotThrow(() -> generator.generateFor(user.id, today()).await().atMost(AWAIT));

        final var summaryRequests = MockLlmProfile.server().requests().stream().
            filter(r -> r.contains(PROMPT_ANCHOR)).
            toList();
        assertTrue(summaryRequests.isEmpty(), "无会话无分析的空输入必须跳过 LLM 调用");
        assertNull(storedSummary(user.id), "空输入不得落出空内容行");
    }
    //endregion

    //region ④ 活跃窗聚合
    @Test
    void activeUserIdsSince_ShouldContainOnlyUsersActiveWithinWindow()
    {
        final var recent = ensureUser("gen-active-recent");
        final var stale  = ensureUser("gen-active-stale");
        seedSession(recent.id, "本周还在对话");
        seedStaleSession(stale.id, "十天前的对话");

        final var activeIds = generator.activeUserIdsSince(Instant.now().minus(java.time.Duration.ofDays(7))).
            await().atMost(AWAIT);

        assertTrue(activeIds.contains(recent.id), "近 7 天有会话的用户必须在活跃名单内");
        assertFalse(activeIds.contains(stale.id), "超出 7 天活跃窗的用户不得进入生成名单");
    }
    //endregion

    //region ⑤ 内容归一化与调度契约
    @Test
    void normalizedContent_ShouldStripCapAndRejectBlank()
    {
        assertEquals("今天很平稳", DailySummaryGenerator.normalizedContent("  今天很平稳  "), "前后空白应剥离且短文原样透传");
        assertEquals(200, DailySummaryGenerator.normalizedContent("长".repeat(250)).length(), "超长内容必须截断至 200 字封顶");
        assertNull(DailySummaryGenerator.normalizedContent("   "), "纯空白 LLM 回复必须拒绝 (不落空内容行)");
    }

    //* 调度 cron 即需求锚 (每日 03:00): 注解漂移会让生成静默错拍, 结构断言钉死.
    //* timeZone 显式钉定 Asia/Shanghai: cron 触发时刻不得依赖 JVM 默认时区 (部署环境漂移防护),
    //* 与日期计算的 TimeUtils.ZONE_ASIA_SHANGHAI 同源 (fix round: review Finding 2).
    @Test
    void scheduled_ShouldDeclareThreeAmCron() throws Exception
    {
        final var method = DailySummaryGenerator.class.getDeclaredMethod("generateDailySummaries");
        final var scheduled = method.getAnnotation(io.quarkus.scheduler.Scheduled.class);
        assertNotNull(scheduled, "generateDailySummaries 必须挂 @Scheduled");
        assertEquals("0 0 3 * * ?", scheduled.cron());
        assertEquals("Asia/Shanghai", scheduled.timeZone());
    }
    //endregion

    //region 测试脚手架
    private LocalDate today() { return LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI); }

    /**
     * 确保角色账号存在并返回实体: 独立事务按用户名查重, 缺席则以 {@code User.create} 工厂落库
     * (ClinicalPipelineTest 同款模式).
     */
    private User ensureUser(String rolePrefix)
    {
        return users.computeIfAbsent(rolePrefix, k ->
        {
            final var username = PrintUtils.quickFormat("summary-gen-{}-{}", rolePrefix, SUFFIX);
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

    //* 真库直插会话 (updatedAt = now, 落活跃窗内): 不经对话链路 (AI 依赖与本题无关), 造数同款取舍.
    //* messages JSONB 用字面拼接而非 quickFormat: SLF4J 的 {{ 转义语义在 JSON 场景可读性差.
    private void seedSession(UUID userId, String content)
    {
        seedSessionAt(userId, "[{\"role\":\"user\",\"content\":\"" + content + "\"}]", Instant.now());
    }

    //* 真库直插活跃窗外的旧会话 (updatedAt = 10 天前): 供活跃窗过滤断言.
    private void seedStaleSession(UUID userId, String content)
    {
        seedSessionAt(userId, "[{\"role\":\"user\",\"content\":\"" + content + "\"}]", Instant.now().minus(java.time.Duration.ofDays(10)));
    }


    private void seedSessionAt(UUID userId, String messagesJson, Instant updatedAt)
    {
        final var session = new AiChatSession();
        session.id               = UUID.randomUUID();
        session.userId           = userId;
        session.messages         = messagesJson;
        session.warningTriggered = false;
        session.updatedAt        = updatedAt;
        sessionFactory.withTransaction((s, tx) -> session.persist()).await().atMost(AWAIT);
    }

    //* 真库直插带分析结果的日记 (createdAt = now): 情绪分析输入源, 不经分析链路 (LLM 依赖与本题无关).
    private void seedDiary(UUID userId, String analysisJson)
    {
        final var diary = new MoodDiary();
        diary.userId         = userId;
        diary.content        = "今天整体还行";
        diary.analysisResult = analysisJson;
        diary.createdAt      = Instant.now();
        sessionFactory.withTransaction((s, tx) -> diary.persist()).await().atMost(AWAIT);
    }

    //* 独立事务新开 session 查询当日总结行 (缺席为 null): 读已提交数据, 不受一级缓存干扰.
    private kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity storedSummary(UUID userId)
    {
        final var rows = storedSummaryRows(userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private List<kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity> storedSummaryRows(UUID userId)
    {
        return sessionFactory.withTransaction((session, tx) ->
            session.createQuery(
                    "from DailySummaryEntity e where e.userId = ?1 and e.date = ?2 order by e.createdAt desc",
                    kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity.class).
                setParameter(1, userId).
                setParameter(2, today()).
                getResultList()
        ).await().atMost(AWAIT);
    }

    //* 真库前置: dev 库可能尚未应用 06 号迁移, 幂等确保 daily_summaries 表存在
    //* (ClinicalPipelineTest 同款, 脚本单一来源: classpath 直读权威 DDL, IF NOT EXISTS 可重复执行).
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
                DailySummaryGeneratorTest.class.getResourceAsStream(resource),
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
