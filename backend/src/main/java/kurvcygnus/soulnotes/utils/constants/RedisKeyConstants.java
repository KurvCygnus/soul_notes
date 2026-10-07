package kurvcygnus.soulnotes.utils.constants;

import org.jetbrains.annotations.NotNull;

/**
 * Redis Key 模式常量.
 * <ul>
 *     <li>{@link #TOKEN_BLACKLIST} — JWT 黑名单 Key, 使用 {@link String#formatted(Object...)} 传入 jti</li>
 *     <li>{@link #RATE_LIMIT} — 限流 Key, 首段为业务域 (chat/login/voice), 次段为限流维度 (userId/ip)</li>
 *     <li>{@link #RED_COOLDOWN} — RED 预警冷却 Key, 使用 {@link String#formatted(Object...)} 传入 userId
 *     (AlertDispatchService per-user 冷却闸门, 值为写入时刻, 写入即带 TTL 由 Redis 自动过期)</li>
 * </ul>
 * @since 1.0
 */
public final class RedisKeyConstants
{
    private RedisKeyConstants() { throw new IllegalAccessError("Class \"RedisKeyConstants\" is not meant to be instantized!"); }

    public static final @NotNull String TOKEN_BLACKLIST = "jwt:blacklist:%s";
    //? Phase 4: 限流功能启用时使用
    public static final @NotNull String RATE_LIMIT      = "ratelimit:%s:%s";
    //* 单 %s 占位 (per-user 维度): 冷却窗口严禁漂移成全局共享 Key, 否则一次预警将抑制全站用户的外呼.
    public static final @NotNull String RED_COOLDOWN    = "alert:red-cooldown:%s";

    //region 扩展通知 (P3 Task 1)
    //* 幂等键三段 (ruleId+type+日期): SETNX EX 86400 — 同日同规则只下发一次, 次日随 TTL 过期自然放开.
    public static final @NotNull String EXT_NOTIFY_DEDUP   = "ext:notify:%s:%s:%s";
    //* 通知启用开关 (userId×extName): 值 "1" = 开, 缺席 = 默认关 (TTL 永久); 调度器按前缀扫描枚举启用面.
    public static final @NotNull String EXT_NOTIFY_SWITCH  = "ext:notify:on:%s:%s";
    //* 开关键前缀扫描模式: 与 EXT_NOTIFY_SWITCH 前缀严格同源, 改写任一须同步.
    public static final @NotNull String EXT_NOTIFY_SCAN    = "ext:notify:on:*";
    //endregion
}
