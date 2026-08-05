package kurvcygnus.soulnotes.domain.auth.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link TokenService} 反射单元测试</b>
 * <p>通过反射验证辅助方法的行为.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class TokenServiceTest
{
    //region extractJti
    @Test void extractJti_ShouldReturnJtiClaimFromPayload() throws Exception
    {
        final var method = getPrivateStaticMethod("extractJti", String.class);
        final var payload = Base64.getUrlEncoder().withoutPadding().
            encodeToString("{\"jti\":\"unique-token-id\"}".getBytes());
        final var token = "eyJhbGciOiJIUzI1NiJ9." + payload + ".signature";

        final var jti = method.invoke(null, token);
        assertNotNull(jti);
        assertEquals("unique-token-id", jti);
    }

    @Test void extractJti_ShortToken_ShouldHashEntireToken() throws Exception
    {
        final var method = getPrivateStaticMethod("extractJti", String.class);
        final var jti    = method.invoke(null, "not-a-jwt");
        assertNotNull(jti);
        assertEquals(64, ((String) jti).length());
    }

    @Test void extractJti_InvalidPayload_ShouldFallbackToHash() throws Exception
    {
        final var method = getPrivateStaticMethod("extractJti", String.class);
        //* payload 不是合法 JSON, 应回退到 SHA-256 哈希.
        final var jti = method.invoke(null, "eyJhbGciOiJIUzI1NiJ9.not-valid-payload.signature");
        assertNotNull(jti);
        assertEquals(64, ((String) jti).length());
    }

    @Test void extractJti_ConsistentInput_ShouldReturnConsistentResult() throws Exception
    {
        final var method = getPrivateStaticMethod("extractJti", String.class);
        final var token  = "aaa.bbb.ccc";
        final var jti1   = method.invoke(null, token);
        final var jti2   = method.invoke(null, token);
        assertEquals(jti1, jti2);
    }
    //endregion

    //region sha256Hex
    @Test void sha256Hex_ShouldReturn64CharHex() throws Exception
    {
        final var method = getPrivateStaticMethod("sha256Hex", String.class);
        final var hash   = method.invoke(null, "test-input");
        assertNotNull(hash);
        assertEquals(64, ((String) hash).length());
    }

    @Test void sha256Hex_EmptyInput_ShouldReturnValidHash() throws Exception
    {
        final var method = getPrivateStaticMethod("sha256Hex", String.class);
        final var hash   = method.invoke(null, "");
        assertNotNull(hash);
        assertEquals(64, ((String) hash).length());
    }
    //endregion

    //region 反射工具
    private static Method getPrivateStaticMethod(String name, Class<?>... paramTypes) throws NoSuchMethodException
    {
        final var method = TokenService.class.getDeclaredMethod(name, paramTypes);
        assertTrue(Modifier.isStatic(method.getModifiers()), "方法 " + name + " 应为 static");
        assertTrue(Modifier.isPrivate(method.getModifiers()), "方法 " + name + " 应为 private");
        method.setAccessible(true);
        return method;
    }
    //endregion
}
