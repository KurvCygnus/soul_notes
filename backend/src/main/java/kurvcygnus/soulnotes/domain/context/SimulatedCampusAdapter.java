package kurvcygnus.soulnotes.domain.context;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import kurvcygnus.soulnotes.utils.TimeUtils;
import org.jetbrains.annotations.NotNull;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * 模拟校园数据源: 演示与集成测试用的领域数据适配器.
 * <p>对外叙事为"标准接入层, 已预留真实教务适配器位" — 本类即该层当前的默认数据源.</p>
 * @implNote 数据与 userId 无关 (演示场景单账号); 考试锚定调用日 +6/+13/+20 天, 倒计时恒定不穿帮.
 * @since 1.5.0
 */
@SuppressWarnings("JavadocDeclaration") @ApplicationScoped
public final class SimulatedCampusAdapter implements DomainDataPort
{
    private static final ZoneId ZONE = TimeUtils.ZONE_ASIA_SHANGHAI;

    @Override public @NotNull Uni<List<ScheduleItem>> todaySchedule(@NotNull UUID userId)
    { return Uni.createFrom().item(todaySchedule(LocalDate.now(ZONE).getDayOfWeek())); }

    //* 包级测试缝: 按星期取课表.
    @NotNull List<ScheduleItem> todaySchedule(@NotNull DayOfWeek day)
    {
        final var timetable = Map.<DayOfWeek, List<ScheduleItem>>ofEntries(
            Map.entry(DayOfWeek.MONDAY, List.of(
                new ScheduleItem("高等数学", "08:00-09:40", "一教 302"),
                new ScheduleItem("数据结构", "10:00-11:40", "二教 105"),
                new ScheduleItem("大学英语", "14:00-15:40", "外语楼 210"),
                new ScheduleItem("体育", "16:00-17:40", "田径场"))),
            Map.entry(DayOfWeek.TUESDAY, List.of(
                new ScheduleItem("线性代数", "08:00-09:40", "一教 401"),
                new ScheduleItem("高等数学", "10:00-11:40", "一教 302"),
                new ScheduleItem("计算机网络", "14:00-15:40", "实验楼 508"),
                new ScheduleItem("心理健康讲座", "16:00-17:40", "大礼堂"))),
            Map.entry(DayOfWeek.WEDNESDAY, List.of(
                new ScheduleItem("数据结构", "08:00-09:40", "二教 105"),
                new ScheduleItem("大学英语", "10:00-11:40", "外语楼 210"),
                new ScheduleItem("线性代数", "14:00-15:40", "一教 401"),
                new ScheduleItem("选修: 中国近代史", "16:00-17:40", "三教 118"))),
            Map.entry(DayOfWeek.THURSDAY, List.of(
                new ScheduleItem("高等数学", "08:00-09:40", "一教 302"),
                new ScheduleItem("计算机网络", "10:00-11:40", "实验楼 508"),
                new ScheduleItem("数据结构实验", "14:00-15:40", "实验楼 508"),
                new ScheduleItem("班会", "16:00-17:40", "二教 105"))),
            Map.entry(DayOfWeek.FRIDAY, List.of(
                new ScheduleItem("大学英语", "08:00-09:40", "外语楼 210"),
                new ScheduleItem("高等数学习题课", "10:00-11:40", "一教 302"),
                new ScheduleItem("社团活动", "16:00-17:40", "学生中心")))
        );
        return timetable.getOrDefault(day, List.of());
    }

    @Override public @NotNull Uni<List<ExamItem>> upcomingExams(@NotNull UUID userId, int withinDays)
    {
        final var today = LocalDate.now(ZONE);
        return Uni.createFrom().item(Stream.of(
                new ExamItem("高等数学期中考", today.plusDays(6), 6, "一教 302"),
                new ExamItem("大学英语期中考", today.plusDays(13), 13, "外语楼机房"),
                new ExamItem("数据结构随堂测", today.plusDays(20), 20, "二教 105")
            ).
            filter(e -> e.daysUntil() <= withinDays).
            toList());
    }

    @Override public @NotNull Uni<List<AgendaItem>> recentAgenda(@NotNull UUID userId, int withinDays)
    {
        final var today = LocalDate.now(ZONE);
        return Uni.createFrom().item(List.of(
            new AgendaItem("班级团日活动", today.plusDays(2), "下午 14:00 学生中心集合"),
            new AgendaItem("图书馆借书到期", today.plusDays(4), "三本, 可线上续借"),
            new AgendaItem("奖学金申请截止", today.plusDays(9), "需辅导员签字")
        ).stream().filter(a -> ChronoUnit.DAYS.between(today, a.date()) <= withinDays).toList());
    }
}
