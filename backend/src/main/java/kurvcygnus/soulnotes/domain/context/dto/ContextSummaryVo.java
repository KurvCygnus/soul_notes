package kurvcygnus.soulnotes.domain.context.dto;

import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import org.jetbrains.annotations.NotNull;

import java.util.List;

/**
 * 学生情境聚合 VO: {@code GET /api/v1/context/summary} 的负载, 供前端"你的情境"卡渲染.
 * <p>三数组恒非 {@code null} — {@code ai.domain.adapter=none} 或取数降级时为空数组,
 * 前端据 {@code size==0} 判空隐藏情境区, 绝不处理缺席键.</p>
 *
 * @param schedule 今日课表条目 (无数据时为空数组)
 * @param exams    未来考试条目 (无数据时为空数组)
 * @param agenda   近期日程条目 (无数据时为空数组)
 * @since 1.5.0
 */
public record ContextSummaryVo(
    @NotNull List<ScheduleItem> schedule,
    @NotNull List<ExamItem>     exams,
    @NotNull List<AgendaItem>   agenda
) {}
