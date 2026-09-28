package kurvcygnus.soulnotes.domain.context;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * 领域数据网关: {@link DomainDataPort} 的配置化出口.
 * <p>{@code ai.domain.adapter=none} (默认) 时全空 — 注入链路与 ContextResource 自动静默;
 * {@code simulated} 时委派 {@link SimulatedCampusAdapter}. 全链路 fail-open: 任何失败/超时降级空集,
 * 绝不拖垮对话与预警主链路.</p>
 * @since 1.5.0
 */
//! 抑制为跨任务计划契约原样保留 (Task 5-8 片段同形), 非误用.
@SuppressWarnings("JavadocDeclaration")
//? 有意注入具体类 SimulatedCampusAdapter 而非 DomainDataPort 接口: 网关自身即 DomainDataPort 实现, 注接口会构成双实现 DI 歧义
@ApplicationScoped
public final class DomainDataGateway implements DomainDataPort
{
    private static final Logger LOG = LoggerFactory.getLogger(DomainDataGateway.class);

    //* 统一降级时限: 情境数据是增强项, 2s 内不回即放弃.
    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final @NotNull String adapter;
    private final @NotNull SimulatedCampusAdapter simulated;

    public DomainDataGateway(
        @ConfigProperty(name = "ai.domain.adapter", defaultValue = "none") @NotNull String adapter,
        @NotNull SimulatedCampusAdapter simulated
    ) { this.adapter = adapter; this.simulated = simulated; }

    @Override public @NotNull Uni<List<ScheduleItem>> todaySchedule(@NotNull UUID userId)
    { return guard("simulated".equals(adapter) ? simulated.todaySchedule(userId) : Uni.createFrom().item(List.of())); }

    @Override public @NotNull Uni<List<ExamItem>> upcomingExams(@NotNull UUID userId, int withinDays)
    { return guard("simulated".equals(adapter) ? simulated.upcomingExams(userId, withinDays) : Uni.createFrom().item(List.of())); }

    @Override public @NotNull Uni<List<AgendaItem>> recentAgenda(@NotNull UUID userId, int withinDays)
    { return guard("simulated".equals(adapter) ? simulated.recentAgenda(userId, withinDays) : Uni.createFrom().item(List.of())); }

    //* 统一 fail-open 缝: 超时/失败一律空集, 且两路都必须 WARN 留痕 (静默降级会让挂死适配器在运维上不可见).
    //! 超时恢复必须走 Supplier 内记日志 — 若先 recoverWithItem 成条目, 后置 onFailure 永不再触发, 超时将无痕.
    //! 另: 简报片段漏写本方法的 <T> 声明, 已补 (泛型方法签名必要).
    @NotNull <T> Uni<List<T>> guard(@NotNull Uni<List<T>> source)//* 测试可见: 包级
    {
        return source.
            ifNoItem().after(TIMEOUT).recoverWithItem(() -> {
                LOG.warn("领域数据取数超时, 降级空集");
                return List.of();
            }).
            onFailure().invoke(t -> LOG.warn("领域数据取数失败, 降级空集: {}", t.getMessage())).
            onFailure().recoverWithItem(List.of());
    }
}
