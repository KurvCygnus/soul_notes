package kurvcygnus.soulnotes.ai.tool;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link CrisisInterventionTool} 单元测试</b>
 *
 * @author Claude Code
 * @since 2.0
 */
class CrisisInterventionToolTest
{
    @Test void getCrisisMessage_ShouldReturnHotlineInfo()
    {
        final var tool = new CrisisInterventionTool();
        final var message = tool.getCrisisMessage("test-user");

        assertNotNull(message);
        assertTrue(message.contains("400"));
        assertTrue(message.contains("12355"));
    }

    @Test void getCrisisMessage_ShouldBeNonEmpty()
    {
        final var tool = new CrisisInterventionTool();
        assertFalse(tool.getCrisisMessage("any-user").isBlank());
    }
}
