package kurvcygnus.soulnotes.utils;

import org.jetbrains.annotations.NotNull;

import java.time.Instant;
import java.time.ZoneId;

/**
 * <b>时间工具类</b>
 * <ul>
 *     <li>统一使用 {@code Asia/Shanghai} 时区</li>
 *     <li>提供 {@link #now()} 便捷方法</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
public final class TimeUtils
{
    public static final @NotNull ZoneId ZONE_ASIA_SHANGHAI = ZoneId.of("Asia/Shanghai");

    private TimeUtils() { throw new IllegalAccessError("Class \"TimeUtils\" is not meant to be instantized!"); }

    /**
     * <span style="color: 95cc6d">获取当前时刻 (上海时区).</span>
     */
    public static @NotNull Instant now() { return Instant.now(); }
}
