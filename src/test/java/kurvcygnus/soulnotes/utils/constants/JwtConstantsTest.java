package kurvcygnus.soulnotes.utils.constants;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link JwtConstants} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class JwtConstantsTest
{
    @Test void issuer_ShouldBeSoulNotes() { assertEquals("soul-notes", JwtConstants.ISSUER); }

    @Test void tokenPrefix_ShouldBeBearerWithSpace() { assertEquals("Bearer ", JwtConstants.TOKEN_PREFIX); }

    @Test void tokenPrefixLength_ShouldBe7() { assertEquals(7, JwtConstants.TOKEN_PREFIX_LENGTH); }

    @Test void authHeader_ShouldBeAuthorization() { assertEquals("Authorization", JwtConstants.AUTH_HEADER); }

    @Test void challengeRealm_ShouldBeBearer() { assertEquals("Bearer", JwtConstants.CHALLENGE_REALM); }

    @Test void prefixLength_ShouldMatchPrefix_SoThatSubstringWorks()
    {
        //* 验证 TOKEN_PREFIX_LENGTH 精确对应 "Bearer ".length()
        assertEquals(JwtConstants.TOKEN_PREFIX.length(), JwtConstants.TOKEN_PREFIX_LENGTH);
    }
}
