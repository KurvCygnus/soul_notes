package kurvcygnus.soulnotes.domain.extension.builtin;

import kurvcygnus.soulnotes.domain.extension.ExtensionNotificationRule;
import kurvcygnus.soulnotes.domain.extension.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.extension.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.extension.DomainItems.ScheduleItem;
import kurvcygnus.soulnotes.utils.PrintUtils;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * campus 演示数据体: 纯静态数据 — 按星期课表 / 考试锚定取数日 +6/+13/+20 / 日程锚定 +2/+4/+9,
 * 为内置三扩展 ({@link TimetableExtension}/{@link ExamsExtension}/{@link AgendaExtension}) 的唯一取数源.
 *
 * @implNote 数据与 userId 无关 (演示场景单账号); {@code today} 显式入参而非内部取 {@code now} —
 *           取数逻辑保持确定性 (测试可锚定任意日期), 时区解析 (TimeUtils.ZONE_ASIA_SHANGHAI)
 *           留在扩展层完成.
 * @since 1.7.0
 */
public final class DemoCampusData
{
    //* 按星期课表 (MON~FRI 有课, 周末 getOrDefault 空集) — 演示数据原样保留.
    private static final Map<DayOfWeek, List<ScheduleItem>> TIMETABLE = Map.ofEntries(
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

    private DemoCampusData() { throw new IllegalAccessError("Class \"DemoCampusData\" is not meant to be instantized!"); }

    /**
     * 按星期取当日课表.
     *
     * @param day 星期几
     * @return 当日课表; 周末/无课日为空集
     */
    public static @NotNull List<ScheduleItem> timetable(@NotNull DayOfWeek day)
    { return TIMETABLE.getOrDefault(day, List.of()); }

    /**
     * 取数日 {@code withinDays} 天窗内的考试 (倒计时锚定取数日, +6/+13/+20 三条).
     *
     * @param today      取数日 (考试日锚定基准)
     * @param withinDays 窗口天数
     * @return 窗口内考试; 无则空集
     */
    public static @NotNull List<ExamItem> exams(@NotNull LocalDate today, int withinDays)
    {
        return Stream.of(
                new ExamItem("高等数学期中考", today.plusDays(6), 6, "一教 302"),
                new ExamItem("大学英语期中考", today.plusDays(13), 13, "外语楼机房"),
                new ExamItem("数据结构随堂测", today.plusDays(20), 20, "二教 105")
            ).
            filter(e -> e.daysUntil() <= withinDays).
            toList();
    }

    /**
     * 取数日 {@code withinDays} 天窗内的日程 (+2/+4/+9 三条, 均带补充说明).
     *
     * @param today      取数日 (窗口与日程距今天数基准)
     * @param withinDays 窗口天数
     * @return 窗口内日程; 无则空集
     */
    public static @NotNull List<AgendaItem> agenda(@NotNull LocalDate today, int withinDays)
    {
        return Stream.of(
                new AgendaItem("班级团日活动", today.plusDays(2), "下午 14:00 学生中心集合"),
                new AgendaItem("图书馆借书到期", today.plusDays(4), "三本, 可线上续借"),
                new AgendaItem("奖学金申请截止", today.plusDays(9), "需辅导员签字")
            ).
            filter(a -> ChronoUnit.DAYS.between(today, a.date()) <= withinDays).
            toList();
    }

    /**
     * 按星期渲染课表情境贡献行 (P3): 供课表扩展 {@code aiContextContribution} 注入共情对话的
     * "当前情境参考" 块 — 一行式摘要, AI 无需等 LLM 调工具即知今日课程脉络.
     *
     * @param day 星期几
     * @return 贡献文本; 周末/无课日为 {@code null} (无贡献语义, 不产生注入块)
     * @since 2.2.0
     */
    public static @Nullable String contextLine(@NotNull DayOfWeek day)
    {
        final var items = timetable(day);
        if(items.isEmpty())
            return null;
        final var body = items.stream().
            map(i -> PrintUtils.quickFormat("{} {} @{}", i.timeRange(), i.course(), i.location())).
            collect(java.util.stream.Collectors.joining("; "));
        return "今日课表: " + body;
    }

    /**
     * 计算此刻到期的上课提醒 (P3): 每节课 "上课前 15 分钟" 一条 — 到期窗口为
     * {@code [开课-15min, 开课)} (开窗含, 开课即出窗: 迟到补推无意义).
     *
     * @param day 星期几 (取当日课表)
     * @param now 此刻 (业务时区)
     * @return 到期规则; 无则空集
     * @implNote 计算逻辑在扩展内 (调度器只负责幂等与下发, P3 契约); 时间段解析失败的条目跳过
     *           (fail-open, 演示数据恒为合法 {@code HH:mm-HH:mm} 形态); 规则 ID 含节次序号 + 课名,
     *           同日稳定且互异 — 与调度器幂等键 (ruleId+type+日期) 配合实现当日一次.
     * @since 2.2.0
     */
    public static @NotNull List<ExtensionNotificationRule> dueClassNotifications(
        @NotNull DayOfWeek day, @NotNull java.time.LocalTime now
    )
    {
        final var items = timetable(day);
        if(items.isEmpty())
            return List.of();
        final var due = new ArrayList<ExtensionNotificationRule>(items.size());
        for(var i = 0; i < items.size(); i++)
        {
            final var item = items.get(i);
            final java.time.LocalTime start;
            try { start = java.time.LocalTime.parse(item.timeRange().split("-", 2)[0]); }
            catch(final RuntimeException e) { continue; //! 时间段损坏: 跳过该条目 (fail-open), 不让单条坏数据中断全部提醒.
            }
            final var notifyFrom = start.minusMinutes(15);
            if(now.isBefore(notifyFrom) || !now.isBefore(start))
                continue;
            due.add(new ExtensionNotificationRule(
                PrintUtils.quickFormat("class-{}-{}", i + 1, item.course()),
                "class",
                "即将上课",
                PrintUtils.quickFormat("「{}」{} 在 {}", item.course(), item.timeRange(), item.location()),
                -15
            ));
        }
        return List.copyOf(due);
    }
}
