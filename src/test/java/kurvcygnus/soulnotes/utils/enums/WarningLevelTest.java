package kurvcygnus.soulnotes.utils.enums;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link WarningLevel} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class WarningLevelTest
{
    @Test void shouldHaveThreeLevels()
    {
        final var levels = WarningLevel.values();
        assertEquals(3, levels.length);
    }

    @Test void none_ShouldBeNormal() { assertEquals(WarningLevel.NONE, WarningLevel.valueOf("NONE")); }

    @Test void yellow_ShouldBeWatchLevel() { assertEquals(WarningLevel.YELLOW, WarningLevel.valueOf("YELLOW")); }

    @Test void red_ShouldBeCritical() { assertEquals(WarningLevel.RED, WarningLevel.valueOf("RED")); }

    @Test void enumOrdinal_ShouldBeNoneYellowRed()
    {
        assertTrue(WarningLevel.NONE.ordinal() < WarningLevel.YELLOW.ordinal());
        assertTrue(WarningLevel.YELLOW.ordinal() < WarningLevel.RED.ordinal());
    }
}