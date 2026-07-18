package kurvcygnus.soulnotes.utils.constants;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link RedisKeyConstants} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class RedisKeyConstantsTest
{
    @Test void tokenBlacklist_ShouldContainFormatPlaceholder()
    {
        assertTrue(RedisKeyConstants.TOKEN_BLACKLIST.contains("%s"));
    }

    @Test void tokenBlacklist_ShouldFormatCorrectly()
    {
        final var result = RedisKeyConstants.TOKEN_BLACKLIST.formatted("test-jti");
        assertEquals("jwt:blacklist:test-jti", result);
    }

    @Test void rateLimit_ShouldContainFormatPlaceholders()
    {
        assertEquals(2, RedisKeyConstants.RATE_LIMIT.chars().filter(c -> c == 's').count());
    }
}
