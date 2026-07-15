package kurvcygnus.soulnotes.utils;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link PrintUtils} 的单元测试</b>
 * <p>重点测试 {@link PrintUtils#quickFormat} 的正确性与健壮性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class PrintUtilsTest
{
    @Test void quickFormat_ShouldReplacePlaceholders()
    {
        final var result = PrintUtils.quickFormat("Hello, {}!", "World");
        assertEquals("Hello, World!", result);
    }

    @Test void quickFormat_MultiplePlaceholders_ShouldReplaceAll()
    {
        final var result = PrintUtils.quickFormat("{} + {} = {}", 1, 2, 3);
        assertEquals("1 + 2 = 3", result);
    }

    @Test void quickFormat_NoPlaceholders_ShouldReturnOriginal()
    {
        final var result = PrintUtils.quickFormat("No placeholders");
        assertEquals("No placeholders", result);
    }

    @Test void quickFormat_NullFormat_ShouldThrowNullPointerException()
    {
        assertThrows(NullPointerException.class, () -> PrintUtils.quickFormat(null, "arg"));
    }

    @Test void quickFormat_NullArgs_ShouldThrowNullPointerException()
    {
        assertThrows(NullPointerException.class, () -> PrintUtils.quickFormat("test", (Object[]) null));
    }

    @Test void quickFormat_BlankFormat_ShouldThrowIllegalArgumentException()
    {
        assertThrows(IllegalArgumentException.class, () -> PrintUtils.quickFormat("", "arg"));
        assertThrows(IllegalArgumentException.class, () -> PrintUtils.quickFormat("  ", "arg"));
    }

    @Test void quickFormat_WithNullArg_ShouldDisplayNull()
    {
        final var result = PrintUtils.quickFormat("value is {}", (Object) null);
        assertEquals("value is null", result);
    }

    @Test void getLogger_ShouldReturnLoggerForCallerClass()
    {
        final var logger = PrintUtils.getLogger();
        assertNotNull(logger);
        assertEquals(PrintUtilsTest.class.getName(), logger.getName());
    }
}