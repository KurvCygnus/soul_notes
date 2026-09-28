package kurvcygnus.soulnotes.domain.context;

import io.smallrye.mutiny.Uni;
import kurvcygnus.soulnotes.domain.context.DomainItems.AgendaItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ExamItem;
import kurvcygnus.soulnotes.domain.context.DomainItems.ScheduleItem;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 领域数据网关单元测试: 配置开关 (none/unknown) 与 fail-open 降级契约.
 * <p>纯单元测试, 不启 Quarkus, 不触库 — 网关的配置经构造器直传而非 {@code @ConfigProperty} 装配.</p>
 * @since 1.5.0
 */
//! 简报测试代码原样含 @NotNull, 但 annotations 依赖为 compileOnly 不进测试类路径 (不可编译);
//! 匿名实现的返回注解按项目测试惯例省略, 由本抑制吸收覆盖注解缺失的告警.
@SuppressWarnings("NullableProblems")
class DomainDataGatewayTest
{
    //* none 模式: 三方法恒空集且不失败 (fail-open 契约).
    @Test void gateway_NoneAdapter_YieldsEmptyLists()
    {
        final var gw = new DomainDataGateway("none", new SimulatedCampusAdapter());
        assertEquals(List.of(), gw.todaySchedule(UUID.randomUUID()).await().indefinitely());
        assertEquals(List.of(), gw.upcomingExams(UUID.randomUUID(), 7).await().indefinitely());
        assertEquals(List.of(), gw.recentAgenda(UUID.randomUUID(), 7).await().indefinitely());
    }

    //* simulated 模式: 委派适配器; 未知值按 none 处理.
    @Test void gateway_UnknownAdapter_FallsBackToEmpty()
    {
        final var gw = new DomainDataGateway("whatever", new SimulatedCampusAdapter());
        assertEquals(List.of(), gw.todaySchedule(UUID.randomUUID()).await().indefinitely());
    }

    //* fail-open: 适配器失败降级空集, 绝不向外抛; 失败缝降级必须 WARN 留痕.
    @Test void gateway_AdapterFailure_DegradesToEmpty()
    {
        final var broken = new DomainDataPort()
        {
            public Uni<List<ScheduleItem>> todaySchedule(UUID u) { return Uni.createFrom().failure(new IllegalStateException("boom")); }
            public Uni<List<ExamItem>> upcomingExams(UUID u, int d) { return Uni.createFrom().failure(new IllegalStateException("boom")); }
            public Uni<List<AgendaItem>> recentAgenda(UUID u, int d) { return Uni.createFrom().failure(new IllegalStateException("boom")); }
        };
        final var gw = new DomainDataGateway("none", new SimulatedCampusAdapter());
        final var capture = WarnLogCapture.attach(DomainDataGateway.class);
        try
        {
            assertTrue(gw.guard(broken.upcomingExams(UUID.randomUUID(), 7)).await().indefinitely().isEmpty());
            assertTrue(capture.contains("领域数据取数失败"));
        }
        finally { capture.detach(); }
    }

    //* 补充用例 (超出简报三例): 永不发射的源在 2s 超时后同样降级空集 — 钉死 ifNoItem 超时缝, 不只是失败缝;
    //* 超时缝同样必须 WARN 留痕 — 静默降级会让挂死的适配器在运维上不可见.
    @Test void gateway_SourceNeverEmits_TimeoutDegradesToEmpty()
    {
        final var gw = new DomainDataGateway("none", new SimulatedCampusAdapter());
        final var capture = WarnLogCapture.attach(DomainDataGateway.class);
        try
        {
            assertTrue(gw.guard(Uni.createFrom().nothing()).await().indefinitely().isEmpty());
            assertTrue(capture.contains("领域数据取数超时"));
        }
        finally { capture.detach(); }
    }

    //region WARN 日志捕获辅助

    /**
     * WARN 日志捕获器: 挂在 jboss-logmanager 的网关渠道 logger 上, 供 fail-open 留痕断言.
     * <p>仿 {@code websocket.WarningLogCapture} 的挂接法 (该类包私有不可跨包复用, 就地最小复刻);
     * 本测试断言的降级消息均无 {@code {}} 占位符, 直接取原始 message 即可, 无需占位符还原.</p>
     */
    private static final class WarnLogCapture extends java.util.logging.Handler
    {
        private final org.jboss.logmanager.Logger target;
        //* 挂接前的显式等级 (null = 继承): detach 时还原, 不污染其余用例的日志行为.
        private final java.util.logging.Level previousLevel;
        private final List<String> messages = new CopyOnWriteArrayList<>();

        private WarnLogCapture(org.jboss.logmanager.Logger target, java.util.logging.Level previousLevel)
        { this.target = target; this.previousLevel = previousLevel; }

        static WarnLogCapture attach(Class<?> loggerOwner)
        {
            final var target = org.jboss.logmanager.LogContext.getLogContext().getLogger(loggerOwner.getName());
            final var capture = new WarnLogCapture(target, target.getLevel());
            target.setLevel(org.jboss.logmanager.Level.WARNING);
            target.addHandler(capture);
            return capture;
        }

        boolean contains(String fragment) { return messages.stream().anyMatch(m -> m.contains(fragment)); }

        void detach()
        {
            target.removeHandler(this);
            target.setLevel(previousLevel);
        }

        @Override public void publish(java.util.logging.LogRecord record) { messages.add(record.getMessage()); }
        @Override public void flush() { }
        @Override public void close() { }
    }

    //endregion
}
