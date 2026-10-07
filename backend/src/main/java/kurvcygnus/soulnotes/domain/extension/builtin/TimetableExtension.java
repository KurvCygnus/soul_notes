package kurvcygnus.soulnotes.domain.extension.builtin;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.extension.DomainItems.ScheduleItem;
import kurvcygnus.soulnotes.domain.extension.ExtensionNotificationRule;
import kurvcygnus.soulnotes.domain.extension.IDataExtension;
import kurvcygnus.soulnotes.domain.extension.LLMToolSpec;
import kurvcygnus.soulnotes.domain.extension.Schema;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * 课表扩展 (内置第一方, Task 4): 返回学生今日课表 — "今天有什么课/去哪上课" 类情境问题的时间锚点.
 * <p>数据体在 {@link DemoCampusData}; 本类只做接线:
 * 注册为 CDI bean 即同时获得 REST 查阅端点与 LLM 工具两个出口;
 * P3 起追加两个主动挂点出口: 情境贡献 (提示词注入) 与上课提醒 (通知规则).</p>
 *
 * @implNote 演示实现与 userId 无关 (单账号演示场景, JWT subject 由框架注入, 仅承接不消费);
 *           fail-open 自持: 取数任何异常降级空集 + WARN 留痕, 绝不外抛 (SPI 契约: 恒非 null).
 * @since 1.7.0
 */
@ApplicationScoped
public final class TimetableExtension implements IDataExtension<List<ScheduleItem>, NoArgs>
{
    private static final Logger LOGGER = PrintUtils.getLogger();

    @Override public @NotNull String name() { return "timetable"; }

    @Override public @NotNull Class<NoArgs> argsType() { return NoArgs.class; }

    @Override public @NotNull List<ScheduleItem> query(@NotNull UUID userId, @NotNull NoArgs args)
    {
        try
        {
            return DemoCampusData.timetable(LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI).getDayOfWeek());
        }
        catch(final Exception e)
        {
            LOGGER.warn("今日课表查询失败, 降级为空集", e);
            return List.of();
        }
    }

    //* @NotNull 收窄: 本实现恒暴露工具契约 (接口 @Nullable 是全实现方的宽容上界, 收窄合法).
    @Override public @NotNull LLMToolSpec aiCallCommand()
    { return new LLMToolSpec("query_timetable", "查询学生今日课表", Schema.builder().build()); }

    @Override public @NotNull String toolCallLabel() { return "正在查询课表…"; }

    //region P3 主动挂点: 情境贡献 + 上课提醒
    /**
     * 情境贡献: 今日课表一行式摘要 (有课日), 周末/无课日为 {@code null} (无贡献, 不产生注入块).
     */
    @Override public @Nullable Uni<String> aiContextContribution(@NotNull UUID userId)
    {
        try { return aiContextContribution(userId, LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI).getDayOfWeek()); }
        catch(final Exception e)
        {
            LOGGER.warn("课表情境贡献失败, 按无贡献降级", e);
            return null;
        }
    }

    /**
     * 通知规则: 此刻到期的 "上课前 15 分钟" 提醒 (计算逻辑在扩展内, 调度器只负责幂等与下发).
     */
    @Override public @NotNull Uni<List<ExtensionNotificationRule>> notificationRules(@NotNull UUID userId)
    {
        try
        {
            final var now = java.time.LocalTime.now(TimeUtils.ZONE_ASIA_SHANGHAI);
            return notificationRules(userId, LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI).getDayOfWeek(), now);
        }
        catch(final Exception e)
        {
            LOGGER.warn("课表通知规则收集失败, 降级为空集", e);
            return Uni.createFrom().item(List.of());
        }
    }

    //* 固定星期/时刻的包级测试缝: 生产 SPI 方法按业务时区今日/此刻委托至此, 测试域锚定任意组合.
    Uni<String> aiContextContribution(@NotNull UUID userId, @NotNull DayOfWeek day)
    {
        final var line = DemoCampusData.contextLine(day);
        return line == null ? null : Uni.createFrom().item(line);
    }

    //* 固定星期/时刻的包级测试缝 (与情境贡献缝同款).
    Uni<List<ExtensionNotificationRule>> notificationRules(@NotNull UUID userId, @NotNull DayOfWeek day, @NotNull LocalTime now)
    { return Uni.createFrom().item(DemoCampusData.dueClassNotifications(day, now)); }
    //endregion
}
