package kurvcygnus.soulnotes.domain.extension;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import jakarta.enterprise.inject.Vetoed;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.RedisKeyConstants;
import kurvcygnus.soulnotes.websocket.AlertWebSocket;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>扩展通知调度器集成测试</b> (P3 Task 1, 真 Redis 幂等断言).
 * <p>手动驱动 {@code fireDue(固定日期)} (固定时钟缝), 规则经 {@code rulesOf} 测试缝固定 —
 * 到期计算在扩展内, 调度器只负责幂等与下发, 本测试钉死:</p>
 * <ul>
 *     <li>开关键在场的 (用户×扩展) 才被收集; 开关缺席/指向未注册扩展均空转不抛错</li>
 *     <li>下发经 Redis SETNX 幂等: 同一 (ruleId+type+日期) 同日只下发一次, 幂等键带 TTL</li>
 *     <li>下发负载经录制替身断言 title/body/tag 三元组 (AlertWebSocket 替身, 绕开真实 WS 连接)</li>
 * </ul>
 * <p>基建守卫与 {@code ChatPipelineTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 2.2.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过扩展通知调度器用例")
class ExtensionNotificationSchedulerTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(10);
    //* 固定幂等日期 (不锚定运行日): 调度器只把它拼进幂等键, 语义与任意日期等价.
    private static final LocalDate FIXED_DATE = LocalDate.of(2026, 10, 5);

    @Inject ReactiveRedisDataSource redisDS;
    @Inject ExtensionRegistry registry;

    private RecordingAlertWebSocket recorder;
    private FixedRulesScheduler scheduler;
    private UUID userId;
    private String switchKey;

    @BeforeEach
    void arm()
    {
        //* 扫描面清零 (评审 I-1): ext:notify:on:* 前缀为测试域独占 — dev Redis 先前运行遗留的开关键
        //* 会混进 enabledBindings 扫描结果, 让 "开关缺席不下发" 类断言假失败; 用例前整前缀清空.
        final var residue = redisDS.key().keys(RedisKeyConstants.EXT_NOTIFY_SCAN).await().atMost(AWAIT);
        if(!residue.isEmpty())
            redisDS.key().del(residue.toArray(String[]::new)).await().atMost(AWAIT);

        recorder = new RecordingAlertWebSocket();
        scheduler = new FixedRulesScheduler(registry, redisDS, recorder);
        userId = UUID.randomUUID();
        switchKey = RedisKeyConstants.EXT_NOTIFY_SWITCH.formatted(userId, "timetable");
    }

    @AfterEach
    void disarm()
    {
        //* 测试自清: 开关键 + 两条固定规则的幂等键 (随机 userId 隔离并发用例, 泄漏键不跨用例命中).
        redisDS.key().del(switchKey,
            RedisKeyConstants.EXT_NOTIFY_DEDUP.formatted("class-1-高等数学", "class", FIXED_DATE),
            RedisKeyConstants.EXT_NOTIFY_DEDUP.formatted("class-2-数据结构", "class", FIXED_DATE)
        ).await().atMost(AWAIT);
    }

    //region ① 幂等与下发
    @Test void fireDue_EnabledBinding_ShouldDeliverOnceAndDedupByRedis()
    {
        redisDS.value(String.class).set(switchKey, "1").await().atMost(AWAIT);

        scheduler.fireDue(FIXED_DATE).await().atMost(AWAIT);

        assertEquals(2, recorder.pushes.size(), PrintUtils.quickFormat("两条固定规则应各下发一次, 实际: {}", recorder.pushes));
        assertTrue(recorder.pushes.stream().anyMatch(p -> p.contains("即将上课") && p.contains("高等数学") && p.contains("一教 302")),
            PrintUtils.quickFormat("下发负载必须携带 title/body, 实际: {}", recorder.pushes));
        assertTrue(recorder.pushes.stream().anyMatch(p -> p.contains("数据结构")), "第二条规则应独立下发");

        //* 幂等键必须带 TTL (SETNX EX 86400): 无 TTL 键会让次日通知被永久吞掉.
        final var dedupKey = RedisKeyConstants.EXT_NOTIFY_DEDUP.formatted("class-1-高等数学", "class", FIXED_DATE);
        assertEquals("1", redisDS.value(String.class).get(dedupKey).await().atMost(AWAIT), "幂等键应写入去重值");
        final var ttlMs = redisDS.key().pttl(dedupKey).await().atMost(AWAIT);
        assertTrue(ttlMs != null && ttlMs > 0, PrintUtils.quickFormat("幂等键必须带 TTL (EX 86400), 实际 pttl={}", ttlMs));

        //* 同日二次驱动: Redis 幂等必须挡住重复下发.
        scheduler.fireDue(FIXED_DATE).await().atMost(AWAIT);
        assertEquals(2, recorder.pushes.size(), PrintUtils.quickFormat("同日重复驱动不得重复下发, 实际: {}", recorder.pushes));
    }
    //endregion

    //region ② 开关缺席与残留
    @Test void fireDue_WithoutSwitch_ShouldCollectNothing()
    {
        scheduler.fireDue(FIXED_DATE).await().atMost(AWAIT);
        assertTrue(recorder.pushes.isEmpty(), PrintUtils.quickFormat("开关缺席 (默认关) 不得下发, 实际: {}", recorder.pushes));
    }

    @Test void fireDue_UnknownExtensionSwitch_ShouldSkipWithoutFailure()
    {
        final var ghostKey = RedisKeyConstants.EXT_NOTIFY_SWITCH.formatted(userId, "ghost-ext");
        try
        {
            redisDS.value(String.class).set(ghostKey, "1").await().atMost(AWAIT);
            assertDoesNotThrow(() -> scheduler.fireDue(FIXED_DATE).await().atMost(AWAIT),
                "指向未注册扩展的残留开关必须空跳过 (fail-open), 绝不能打断调度链");
            assertTrue(recorder.pushes.isEmpty(), "未注册扩展无规则可下发");
        }
        finally { redisDS.key().del(ghostKey).await().atMost(AWAIT); }
    }
    //endregion

    //region 测试替身与脚手架
    //* 推送录制替身: 绕开真实 WS 连接 (离线用户推送静默跳过无法断言), 只录参数; 基类构造仅赋值字段, null 配置不消费.
    //* @Vetoed: 基类是 CDI bean, QuarkusTest 域会把测试子类扫描成不可代理 bean 直接炸启动 (实测) — 显式除名.
    @Vetoed static final class RecordingAlertWebSocket extends AlertWebSocket
    {
        final List<String> pushes = new ArrayList<>();

        RecordingAlertWebSocket() { super(null); }

        @Override public io.smallrye.mutiny.Uni<Void> pushExtNotification(UUID userId, String title, String body, String tag)
        {
            pushes.add(PrintUtils.quickFormat("{}|{}|{}|{}", userId, title, body, tag));
            return io.smallrye.mutiny.Uni.createFrom().voidItem();
        }
    }

    //* 规则固定替身: 到期计算属扩展职责, 测试缝直接回报两条固定规则 — 调度器的幂等/下发逻辑由此确定性钉死.
    //* @Vetoed 同上 (RecordingAlertWebSocket 先例).
    @Vetoed static final class FixedRulesScheduler extends ExtensionNotificationScheduler
    {
        private static final List<ExtensionNotificationRule> RULES = List.of(
            new ExtensionNotificationRule("class-1-高等数学", "class", "即将上课", "「高等数学」08:00-09:40 在 一教 302", -15),
            new ExtensionNotificationRule("class-2-数据结构", "class", "即将上课", "「数据结构」10:00-11:40 在 二教 105", -15)
        );

        FixedRulesScheduler(ExtensionRegistry registry, ReactiveRedisDataSource redisDS, AlertWebSocket alertWebSocket)
        { super(null, registry, redisDS, alertWebSocket, 0); }//* tickSeconds=0: 手动驱动, 不注册周期任务.

        @Override io.smallrye.mutiny.Uni<List<ExtensionNotificationRule>> rulesOf(IDataExtension<?, ?> extension, UUID userId)
        { return io.smallrye.mutiny.Uni.createFrom().item(RULES); }
    }
    //endregion
}
