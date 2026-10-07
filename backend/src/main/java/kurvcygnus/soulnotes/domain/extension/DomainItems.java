package kurvcygnus.soulnotes.domain.extension;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.time.LocalDate;

/**
 * 数据扩展条目容器: 课表/考试/日程三类学生情境数据的 record 归档.
 * <p>三个 record 是内置三扩展 (builtin 包 timetable/exams/agenda) 与 {@code DemoCampusData}
 * 演示数据体的公共取数类型; 单文件仅允许一个公开顶层类型, 故以嵌套 record 归档,
 * 消费方经 {@code import DomainItems.XxxItem} 以简名引用.</p>
 * @since 1.5.0
 */
public final class DomainItems
{
    private DomainItems() { throw new IllegalAccessError("Class \"DomainItems\" is not meant to be instantized!"); }

    /**
     * 课表条目.
     *
     * @param course    课程名
     * @param timeRange 起止时间段 (如 {@code 08:00-09:40})
     * @param location  上课地点
     * @since 1.5.0
     */
    public record ScheduleItem(
        @NotNull String course,
        @NotNull String timeRange,
        @NotNull String location
    ) {}

    /**
     * 考试条目.
     *
     * @param name      考试名
     * @param date      考试日期
     * @param daysUntil 距考试日天数 (取数日为基准的不变量, 供展示 "N 天后")
     * @param location  考试地点
     * @since 1.5.0
     */
    public record ExamItem(
        @NotNull String name,
        @NotNull LocalDate date,
        long daysUntil,
        @NotNull String location
    ) {}

    /**
     * 日程条目.
     *
     * @param title 日程标题
     * @param date  日程日期
     * @param note  补充说明, 可为 {@code null}
     * @since 1.5.0
     */
    public record AgendaItem(
        @NotNull String title,
        @NotNull LocalDate date,
        @Nullable String note
    ) {}
}
