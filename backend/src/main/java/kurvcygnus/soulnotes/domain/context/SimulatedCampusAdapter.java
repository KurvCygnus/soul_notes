package kurvcygnus.soulnotes.domain.context;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import org.jetbrains.annotations.NotNull;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 模拟校园数据适配器 (占位壳): 令 {@link DomainDataGateway} 的测试可独立编译运行.
 * <p>哑数据刻意非空 — none 模式断言空集时, 可证明委派被真正绕过而非适配器恰好无数据.</p>
 * @since 1.5.0
 */
//! 裁定原话为"暂不加 CDI 注解", 但实证: 网关已是 @ApplicationScoped, ArC 部署期校验其构造参数无匹配 bean
//! 即抛 UnsatisfiedResolutionException, 令全部 @QuarkusTest 无法启动 (任何 gradlew test 均失败).
//! 故此处必须先挂 @ApplicationScoped (恰为 Task 5 成品的注解形态), 否则本任务"测试绿"验收无法达成.
@SuppressWarnings("JavadocDeclaration")
//? 占位壳: Task 5 将整体替换为种子实现 (哑数据非空以证明 none 模式绕过委派)
@ApplicationScoped
public final class SimulatedCampusAdapter implements DomainDataPort
{
    @Override
    public @NotNull Uni<List<ScheduleItem>> todaySchedule(@NotNull UUID userId)
    { return Uni.createFrom().item(List.of(new ScheduleItem("占位课程", "08:00-09:40", "占位教室"))); }

    @Override
    public @NotNull Uni<List<ExamItem>> upcomingExams(@NotNull UUID userId, int withinDays)
    { return Uni.createFrom().item(List.of(new ExamItem("占位考试", LocalDate.now().plusDays(6), 6, "占位考场"))); }

    @Override
    public @NotNull Uni<List<AgendaItem>> recentAgenda(@NotNull UUID userId, int withinDays)
    { return Uni.createFrom().item(List.of(new AgendaItem("占位日程", LocalDate.now().plusDays(2), "占位说明"))); }
}
