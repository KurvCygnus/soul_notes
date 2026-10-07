package kurvcygnus.soulnotes.domain.extension;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.value.SetArgs;
import io.quarkus.runtime.StartupEvent;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import kurvcygnus.soulnotes.utils.constants.RedisKeyConstants;
import kurvcygnus.soulnotes.websocket.AlertWebSocket;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 扩展通知调度器 (P3 Task 1): 每 60s 对每个启用了通知的用户×扩展收集 {@link IDataExtension#notificationRules},
 * 以 Redis SETNX (ruleId+type+日期, EX 86400) 做当日幂等后, 经 {@link AlertWebSocket} 用户级通道下发
 * {@code ext-notification} 事件 — 到期计算在扩展内, 本类只负责幂等与下发 (P3 契约).
 *
 * @implNote <b>失败语义</b>: 任一环节 (开关扫描/规则收集/单条下发) 失败一律 WARN 跳过 —
 *           通知是提醒性内容, 绝不允许拖垮调度链与后续用户的下发; 与 RED 预警冷却的 fail-open 相反,
 *           幂等键写入失败按 "未获幂等资格" 跳过下发 (fail-closed): 通知漏发一次可接受,
 *           无幂等兜底的 60s 重复轰炸不可接受.
 *           <b>离线语义</b>: WS 推送对离线用户静默跳过且幂等键已被消费 — 扩展通知无离线补偿队列,
 *           上线后等下一个到期窗口 (MVP 取舍, 与 RED 预警的强触达定位不同).
 *           <b>线程纪律</b>: 全链 Redis/WS 均为响应式 Uni, 周期回调在 Vert.x 事件循环上零阻塞执行;
 *           不触碰 Panache, 无安全上下文要求.
 * @since 2.2.0
 */
@SuppressWarnings("unused")//! Vertx 注入供 onStart 注册周期任务, IDE 数据流分析误报字段未消费.
@ApplicationScoped
public class ExtensionNotificationScheduler
{
    private static final @NotNull Logger LOG = PrintUtils.getLogger();

    //* 幂等键 TTL (秒): 86400 = 1 自然日 — 次日键过期自然放开, 与键内日期分量双保险.
    private static final long DEDUP_TTL_SECONDS = 86_400;
    //* 单扩展规则收集超时: SPI 实现方可能外呼, 2s 未产出按空集降级, 防单个扩展卡死整轮调度.
    private static final Duration RULES_TIMEOUT = Duration.ofSeconds(2);
    //* 开关键前缀: 与 RedisKeyConstants.EXT_NOTIFY_SWITCH/EXT_NOTIFY_SCAN 同源 (常量含 %s 不可直接前缀匹配, 字面量同步改写).
    private static final @NotNull String PREFIX = "ext:notify:on:";

    private final @NotNull Vertx vertx;
    private final @NotNull ExtensionRegistry registry;
    private final @NotNull ReactiveRedisDataSource redisDS;
    private final @NotNull AlertWebSocket alertWebSocket;
    //* 周期秒数: <=0 禁用周期任务 (测试域经 MockLlmProfile 置 0 关闸, 手动驱动测试缝; 运维逃生门同款).
    private final long tickSeconds;

    //* 构造器不做 requireNonNull: 入参由 CDI 容器供给完全可靠, 且测试缝允许告警端点置 null (AlertDispatchService 同款).
    public ExtensionNotificationScheduler(
        @NotNull Vertx vertx,
        @NotNull ExtensionRegistry registry,
        @NotNull ReactiveRedisDataSource redisDS,
        @NotNull AlertWebSocket alertWebSocket,
        @ConfigProperty(name = "ext.notify.tick-seconds", defaultValue = "60") long tickSeconds
    )
    {
        this.vertx = vertx;
        this.registry = registry;
        this.redisDS = redisDS;
        this.alertWebSocket = alertWebSocket;
        this.tickSeconds = tickSeconds;
    }

    /**
     * 启动钩子: 注册 60s 周期任务 (tick-seconds <= 0 时禁用 — 测试域/运维逃生门).
     */
    //! 生命周期回调由框架通过反射调用, IDE 静态分析误报 ev 形参为未使用 (ClinicalRetentionCleaner 同款).
    @SuppressWarnings("unused")
    void onStart(@Observes @NotNull StartupEvent ev)
    {
        if(tickSeconds <= 0)
        {
            LOG.info("扩展通知调度已禁用 (ext.notify.tick-seconds <= 0)");
            return;
        }
        vertx.setPeriodic(tickSeconds * 1000L, _ -> fireDue().subscribe().with(
            v -> {},
            t -> LOG.warn("扩展通知调度轮执行失败: {}", t.getMessage())//* 订阅级兜底: 链内失败已逐级收口, 此处仅防意外缺陷.
        ));
    }

    /**
     * 周期入口: 以业务时区今日为幂等日期驱动一轮收集与下发.
     *
     * @return 完成信号
     */
    public @NotNull Uni<Void> fireDue() { return fireDue(LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI)); }

    /**
     * 指定幂等日期驱动一轮 (测试缝: 固定日期断言 Redis 幂等).
     *
     * @param date 业务时区自然日 (幂等键日期分量)
     * @return 完成信号
     */
    Uni<Void> fireDue(@NotNull LocalDate date)
    {
        return enabledBindings().
            flatMap(bindings ->
            {
                //* 逐绑定串行: 调度频率低 (60s) 且绑定面小 (开通知的用户数), 串行足量且天然限流 —
                //* 不对 Redis/WS 形成并发洪峰 (DailySummaryGenerator 串行链同款取舍).
                Uni<Void> chain = Uni.createFrom().voidItem();
                for(final var binding: bindings)
                    chain = chain.chain(v -> fireFor(binding, date));
                return chain;
            });
    }

    /**
     * 规则收集缝 (包级可见, 测试子类覆写固定规则): 到期计算在扩展内, 本类只取产物.
     *
     * @param extension 已注册扩展
     * @param userId    目标用户
     * @return 到期规则列表
     */
    Uni<List<ExtensionNotificationRule>> rulesOf(@NotNull IDataExtension<?, ?> extension, @NotNull UUID userId)
    { return extension.notificationRules(userId); }

    //region 内部缝
    /**
     * 枚举通知启用面: 扫描开关键前缀, 解析为 (用户×扩展) 绑定列表.
     *
     * @return 绑定列表; Redis 故障为空集 (本轮空转 — 通知不因基建抖动向调用方报错)
     */
    private @NotNull Uni<List<NotificationBinding>> enabledBindings()
    {
        return redisDS.key().keys(RedisKeyConstants.EXT_NOTIFY_SCAN).
            onFailure().invoke(t -> LOG.warn("扩展通知开关扫描失败, 本轮空转: {}", t.getMessage())).
            onFailure().recoverWithItem(List.of()).
            map(keys ->
            {
                final var bindings = new ArrayList<NotificationBinding>(keys.size());
                for(final var key: keys)
                {
                    final var binding = parseBinding(key);
                    if(binding != null)
                        bindings.add(binding);
                }
                return List.copyOf(bindings);
            });
    }

    //* 开关键形态 "ext:notify:on:{userId}:{extName}": 扩展名经注册表 ^[a-z][a-z0-9-]*$ 校验不含冒号,
    //* UUID 仅含连字符 — 限长两段拆分是安全的; 畸形键 (手写/残留) 跳过不抛.
    private static @Nullable NotificationBinding parseBinding(@NotNull String key)
    {
        if(!key.startsWith(PREFIX))
            return null;
        final var remainder = key.substring(PREFIX.length());
        final var separator = remainder.indexOf(':');
        if(separator <= 0 || separator == remainder.length() - 1)
            return null;
        try { return new NotificationBinding(UUID.fromString(remainder.substring(0, separator)), remainder.substring(separator + 1)); }
        catch(final IllegalArgumentException e) { return null; }
    }

    /**
     * 单绑定处理: 寻址扩展 → 收集规则 (超时/失败降级空集) → 逐条幂等下发.
     */
    private @NotNull Uni<Void> fireFor(@NotNull NotificationBinding binding, @NotNull LocalDate date)
    {
        final IDataExtension<?, ?> extension;
        try { extension = registry.byName(binding.extName()); }
        catch(final ExtensionException e)
        {
            LOG.debug("扩展通知开关指向未注册扩展, 空跳过: 扩展名={}", binding.extName());
            return Uni.createFrom().voidItem();
        }
        return rulesOf(extension, binding.userId()).
            ifNoItem().after(RULES_TIMEOUT).recoverWithItem(() -> List.of()).
            onFailure().invoke(t -> LOG.warn("扩展通知规则收集失败, 按空集降级: ext={}, userId={}, {}",
                binding.extName(), binding.userId(), t.getMessage())).
            onFailure().recoverWithItem(t -> List.of()).
            flatMap(rules ->
            {
                Uni<Void> chain = Uni.createFrom().voidItem();
                for(final var rule: rules)
                    chain = chain.chain(v -> acquireAndDeliver(binding.userId(), rule, date));
                return chain;
            });
    }

    /**
     * 单条规则: SETNX 抢当日幂等资格, 获得方才推送 (重复到期同日只下发一次).
     */
    private @NotNull Uni<Void> acquireAndDeliver(@NotNull UUID userId, @NotNull ExtensionNotificationRule rule, @NotNull LocalDate date)
    {
        return acquireOnce(rule, date).
            flatMap(acquired ->
            {
                if(!acquired)
                    return Uni.createFrom().voidItem();
                return alertWebSocket.pushExtNotification(userId, rule.title(), rule.bodyTemplate(), rule.id());
            });
    }

    /**
     * 幂等资格缝 (包级可见, 测试子类覆写隔离真实 Redis): SET NX EX 原子抢键.
     *
     * @return {@code true} = 本次获得下发资格; Redis 故障恒 {@code false} (fail-closed, 取舍见类注)
     */
    Uni<Boolean> acquireOnce(@NotNull ExtensionNotificationRule rule, @NotNull LocalDate date)
    {
        final var key = RedisKeyConstants.EXT_NOTIFY_DEDUP.formatted(rule.id(), rule.type(), date);
        return redisDS.value(String.class).setAndChanged(key, "1", new SetArgs().nx().ex(DEDUP_TTL_SECONDS)).
            onFailure().invoke(t -> LOG.warn("扩展通知幂等键写入失败, 跳过本次下发: key={}, {}", key, t.getMessage())).
            onFailure().recoverWithItem(Boolean.FALSE);
    }

    /**
     * 通知绑定 (开关键解析产物): 用户 × 扩展名.
     */
    private record NotificationBinding(@NotNull UUID userId, @NotNull String extName) {}
    //endregion
}
