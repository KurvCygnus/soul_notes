package kurvcygnus.soulnotes.domain.context;

import io.smallrye.mutiny.Uni;
import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.UUID;

/**
 * 领域数据端口: 学生情境数据 (课表/考试/日程) 的统一取数 SPI.
 * <p>实现方自持 fail-open 契约: 任何失败/超时以空集收场, 绝不向对话与预警主链路外抛 —
 * 情境数据是增强项而非必需项, 其缺失不得拖垮核心体验.</p>
 * @apiNote 命名未循 I 前缀惯例 — 本端口名是跨任务计划契约 (Task 5-8 及前端均按 {@code DomainDataPort} 引用), 改名将破坏对齐.
 * @since 1.5.0
 */
public interface DomainDataPort
{
    /**
     * 查询用户今日课表.
     *
     * @param userId 用户 ID
     * @return 今日课表条目列表, 无数据时为空集
     */
    @NotNull Uni<List<ScheduleItem>> todaySchedule(@NotNull UUID userId);

    /**
     * 查询用户未来考试.
     *
     * @param userId    用户 ID
     * @param withinDays 向前展望的天数窗口
     * @return 窗口内考试条目列表, 无数据时为空集
     */
    @NotNull Uni<List<ExamItem>> upcomingExams(@NotNull UUID userId, int withinDays);

    /**
     * 查询用户近期日程.
     *
     * @param userId    用户 ID
     * @param withinDays 向前展望的天数窗口
     * @return 窗口内日程条目列表, 无数据时为空集
     */
    @NotNull Uni<List<AgendaItem>> recentAgenda(@NotNull UUID userId, int withinDays);
}
