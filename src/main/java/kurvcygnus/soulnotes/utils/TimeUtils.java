package kurvcygnus.soulnotes.utils;

import org.jetbrains.annotations.NotNull;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * <b>时间工具类</b>
 * <ul>
 *     <li>统一使用 {@code Asia/Shanghai} 时区</li>
 *     <li>提供 {@link #now()}、{@link #toLocalDate(Instant)} 等便捷方法</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
public final class TimeUtils
{
    public static final @NotNull ZoneId ZONE_ASIA_SHANGHAI = ZoneId.of("Asia/Shanghai");

    private TimeUtils() {}

    /**
     * <span style="color: 95cc6d">获取当前时刻 (上海时区).</span>
     */
    public static @NotNull Instant now() { return Instant.now(); }

    /**
     * <span style="color: 95cc6d">将 {@link Instant} 转为上海时区的 {@link LocalDate}.</span>
     */
    public static @NotNull LocalDate toLocalDate(@NotNull Instant instant) { return instant.atZone(ZONE_ASIA_SHANGHAI).toLocalDate(); }
}
