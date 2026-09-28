package kurvcygnus.soulnotes.domain.context;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * 领域情境注入器: 把课表/考试/日程渲染为紧凑中文情境块, 并入共情对话 system prompt.
 * @implNote 渲染上限 400 字 (防 prompt 膨胀); 无数据返回空串 (prompt 零变化); 整体 fail-open —
 *           网关已保证不失败, 本层仍兜底失败降级空串, 恒不向对话主链路外抛.
 * @since 1.5.0
 */
@SuppressWarnings("JavadocDeclaration") @ApplicationScoped
public final class DomainContextInjector
{
    //* 考试/日程的近景展望窗口 (天): 两周兼顾信息量与 token 成本.
    private static final int WINDOW_DAYS = 14;

    //* 情境块字符上限: 情境是增强项, 不得挤占人设与契约段的 token 预算.
    private static final int MAX_BLOCK_CHARS = 400;

    private final @NotNull DomainDataPort port;

    public DomainContextInjector(@NotNull DomainDataGateway gateway)
    {
        this.port = Objects.requireNonNull(gateway, "Param \"gateway\" must not be null!");
    }

    /**
     * 渲染用户情境块 (今日课表/近期考试/近期日程).
     *
     * @param userId 用户 ID (情境取数键)
     * @return 三类数据全空时为空串 (调用方直接拼接, prompt 零变化);
     *         否则为以 {@code \n\n[学生情境]} 起头的紧凑块, 上限 400 字
     */
    public @NotNull Uni<String> render(@NotNull UUID userId)
    {
        Objects.requireNonNull(userId, "Param \"userId\" must not be null!");
        return Uni.combine().all().unis(
                port.todaySchedule(userId),
                port.upcomingExams(userId, WINDOW_DAYS),
                port.recentAgenda(userId, WINDOW_DAYS)
            ).
            asTuple().
            map(tuple -> render(tuple.getItem1(), tuple.getItem2(), tuple.getItem3())).
            //* 防御缝: 网关契约已 fail-open, 此处兜底仅为保证 render 恒成功 — 调用点在 worker 线程阻塞等待, 不允许意外失败.
            onFailure().recoverWithItem(() -> "");
    }

    //region 块渲染
    /**
     * 纯字符串拼装: 三段各自独立, 有则渲染无则整段跳过.
     *
     * @implNote 头部标签 {@code [学生情境]} 闭括号完整闭合 — 跨任务计划 (前端情境卡与管线断言) 以该字面量为锚.
     */
    private static @NotNull String render(
        @NotNull List<ScheduleItem> schedule,
        @NotNull List<ExamItem> exams,
        @NotNull List<AgendaItem> agenda
    )
    {
        if(schedule.isEmpty() && exams.isEmpty() && agenda.isEmpty())
            return "";
        final var sb = new StringBuilder("\n\n[学生情境] 供自然引用, 与当前话题相关时才提及, 勿罗列式复读\n");
        if(!schedule.isEmpty())
        {
            sb.append("今日课表: ");
            schedule.forEach(i -> sb.append(i.timeRange()).append(' ').append(i.course()).append("  "));
            sb.append('\n');
        }
        if(!exams.isEmpty())
        {
            sb.append("近期考试: ");
            exams.forEach(e -> sb.append(e.name()).append(" (").append(e.daysUntil()).append(" 天后)  "));
            sb.append('\n');
        }
        if(!agenda.isEmpty())
        {
            sb.append("近期日程: ");
            agenda.forEach(a -> sb.append(a.title()).append("  "));
            sb.append('\n');
        }
        return sb.length() > MAX_BLOCK_CHARS ? sb.substring(0, MAX_BLOCK_CHARS) : sb.toString();
    }
    //endregion
}
