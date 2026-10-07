package kurvcygnus.soulnotes.domain.extension.builtin;

import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.extension.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.extension.IDataExtension;
import kurvcygnus.soulnotes.domain.extension.LLMToolSpec;
import kurvcygnus.soulnotes.domain.extension.Schema;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 近期考试扩展 (内置第一方, Task 4): 返回两周内考试安排 — "快考试了很慌" 类情境问题的倒计时数据源
 * (条目自带 daysUntil, 前端/LLM 可直接叙事 "N 天后").
 * <p>数据体在 {@link DemoCampusData} (锚定取数日 +6/+13/+20).</p>
 *
 * @implNote 演示实现与 userId 无关 (单账号演示场景, JWT subject 由框架注入, 仅承接不消费);
 *           fail-open 自持: 取数任何异常降级空集 + WARN 留痕, 绝不外抛 (SPI 契约: 恒非 null).
 * @since 1.7.0
 */
@ApplicationScoped
public final class ExamsExtension implements IDataExtension<List<ExamItem>, NoArgs>
{
    private static final Logger LOGGER = PrintUtils.getLogger();

    //* 两周窗口 (演示语义固定): +6/+13 可见, +20 留作窗口外样本.
    private static final int WINDOW_DAYS = 14;

    @Override public @NotNull String name() { return "exams"; }

    @Override public @NotNull Class<NoArgs> argsType() { return NoArgs.class; }

    @Override public @NotNull List<ExamItem> query(@NotNull UUID userId, @NotNull NoArgs args)
    {
        try
        {
            return DemoCampusData.exams(LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI), WINDOW_DAYS);
        }
        catch(final Exception e)
        {
            LOGGER.warn("近期考试查询失败, 降级为空集", e);
            return List.of();
        }
    }

    //* @NotNull 收窄: 本实现恒暴露工具契约 (接口 @Nullable 是全实现方的宽容上界, 收窄合法).
    @Override public @NotNull LLMToolSpec aiCallCommand()
    { return new LLMToolSpec("query_exams", "查询学生近期考试安排 (两周内)", Schema.builder().build()); }

    @Override public @NotNull String toolCallLabel() { return "正在查询考试安排…"; }
}
