package kurvcygnus.soulnotes.domain.context;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 领域情境注入器单元测试: 空数据零变化契约与紧凑块渲染.
 * <p>纯单元测试, 不启 Quarkus, 不触库 — 网关与注入器均经构造器直传装配 (与 {@code DomainDataGatewayTest} 同款取舍).</p>
 * @since 1.5.0
 */
class DomainContextInjectorTest
{
    //* 无数据 (adapter=none): 空串 — 拼接后 prompt 与 1.4 行为逐字节一致 (无残留换行).
    @Test void render_NoData_ReturnsEmpty()
    {
        final var gw = new DomainDataGateway("none", new SimulatedCampusAdapter());
        assertEquals("", new DomainContextInjector(gw).render(UUID.randomUUID()).await().indefinitely());
    }

    //* 有数据: 块以 "\n\n[学生情境]" 起 (跨任务计划契约), 含考试名与"自然引用"约束; 块长上限 400 (防 prompt 膨胀).
    @Test void render_WithExams_ContainsExamNameAndGuideline()
    {
        final var gw = new DomainDataGateway("simulated", new SimulatedCampusAdapter());
        final var block = new DomainContextInjector(gw).render(UUID.randomUUID()).await().indefinitely();
        assertTrue(block.startsWith("\n\n[学生情境]"), "情境块必须以 \\n\\n[学生情境] 起");
        assertTrue(block.contains("高等数学期中考"));
        assertTrue(block.contains("自然引用"));
        assertTrue(block.length() <= 400);
    }
}
