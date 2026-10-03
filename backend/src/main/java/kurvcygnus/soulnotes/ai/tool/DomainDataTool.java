package kurvcygnus.soulnotes.ai.tool;

import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolMemoryId;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.context.DomainDataGateway;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Objects;
import java.util.UUID;

/**
 * 领域数据工具: AI 按需查询今日课表与近期考试.
 * @implNote fail-safe 契约 — 任何失败形态降级固定提示文本, 绝不抛出 (原仿 UserContextTool 先例, 该工具已随日记域砍除):
 *           {@code ai.domain.tool.enabled=false} (默认) 时返回固定未开启提示.
 * @since 1.5.0
 */
//! 抑制为跨任务计划契约原样保留 (Task 5-8 片段同形), 非误用.
@SuppressWarnings("JavadocDeclaration") @ApplicationScoped
public final class DomainDataTool
{
    private static final Logger LOG = LoggerFactory.getLogger(DomainDataTool.class);

    //* 工具层兜底时限: 网关自身 2s fail-open 在前, 此处仅兜底 await 侧意外, 正常永不触发.
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    //* 考试近景展望窗口 (天): 与 DomainContextInjector#WINDOW_DAYS 对齐, 两类出口窗口一致.
    private static final int EXAM_WINDOW_DAYS = 14;

    private final @NotNull DomainDataGateway gateway;
    private final boolean enabled;

    /**
     * CDI 构造入口; 亦供测试直接构造 ({@code new DomainDataTool(gateway, enabled)}).
     *
     * @param gateway 领域数据网关 (有意注入具体类, 网关注入策略同 {@link kurvcygnus.soulnotes.domain.context.DomainContextInjector})
     * @param enabled 功能开关 (ai.domain.tool.enabled, 默认 false)
     */
    public DomainDataTool(
        @NotNull DomainDataGateway gateway,
        @ConfigProperty(name = "ai.domain.tool.enabled", defaultValue = "false") boolean enabled
    )
    {
        this.gateway = Objects.requireNonNull(gateway, "Param \"gateway\" must not be null!");
        this.enabled = enabled;
    }

    /**
     * 查询学生近期安排 (课表 + 考试).
     * <p>文本形状对齐 {@code DomainContextInjector} 的 "今日课表: ...\n近期考试: ..." 行,
     * 保持注入与按需查询两类出口给 LLM 的语境一致.</p>
     *
     * @param userId 用户 ID ({@code @ToolMemoryId} 透传)
     * @return 安排文本; 功能关闭/非法 ID/任何失败 (含取数超时) 时为固定提示文本
     */
    @Tool("查询学生今日课表与近期考试安排, 需要结合学生日程提供关怀或回答安排类问题时调用")
    @SuppressWarnings("unused")
    public @NotNull String getUpcomingSchedule(@ToolMemoryId String userId)
    {
        if(!enabled)
            return "该功能未开启";
        try
        {
            final var uuid  = UUID.fromString(userId);
            final var exams = gateway.upcomingExams(uuid, EXAM_WINDOW_DAYS).await().atMost(TIMEOUT);
            final var today = gateway.todaySchedule(uuid).await().atMost(TIMEOUT);
            if(exams.isEmpty() && today.isEmpty())
                return "暂无近期安排信息";
            final var sb = new StringBuilder();
            if(!today.isEmpty())
            {
                sb.append("今日课表: ");
                today.forEach(i -> sb.append(i.timeRange()).append(' ').append(i.course()).append("  "));
                sb.append('\n');
            }
            if(!exams.isEmpty())
            {
                sb.append("近期考试: ");
                exams.forEach(e -> sb.append(e.name()).append(" (").append(e.daysUntil()).append(" 天后)  "));
            }
            return sb.toString().trim();
        }
        catch(Exception e)
        {
            //* @Tool 方法运行在 LLM 工具调用循环内, 抛出会中断整次回复 — 降级固定文本并留痕.
            LOG.warn("获取学生近期安排失败: {}", e.getMessage());
            return "暂无近期安排信息";
        }
    }
}
