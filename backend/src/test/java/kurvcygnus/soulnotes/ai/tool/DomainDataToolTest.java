package kurvcygnus.soulnotes.ai.tool;

import kurvcygnus.soulnotes.domain.context.DomainDataGateway;
import kurvcygnus.soulnotes.domain.context.SimulatedCampusAdapter;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link DomainDataTool} 单元测试</b>
 * <p>直接构造 (绕过 CDI), 覆盖开启取种子数据/关闭固定提示/非法用户 ID 不抛三态.</p>
 *
 * @since 1.5.0
 */
class DomainDataToolTest
{
    @Test void tool_Enabled_ReturnsSeeds()
    {
        final var gw = new DomainDataGateway("simulated", new SimulatedCampusAdapter());
        final var tool = new DomainDataTool(gw, true);
        final var out = tool.getUpcomingSchedule(UUID.randomUUID().toString());
        assertTrue(out.contains("高等数学期中考"));
    }

    @Test void tool_Disabled_ReturnsFixedHint()
    {
        final var gw = new DomainDataGateway("simulated", new SimulatedCampusAdapter());
        assertEquals("该功能未开启", new DomainDataTool(gw, false).getUpcomingSchedule(UUID.randomUUID().toString()));
    }

    @Test void tool_IllegalUserId_NeverThrows()
    {
        final var gw = new DomainDataGateway("simulated", new SimulatedCampusAdapter());
        assertDoesNotThrow(() -> new DomainDataTool(gw, true).getUpcomingSchedule("not-a-uuid"));
    }
}
