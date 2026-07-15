package kurvcygnus.soulnotes.domain.auth.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link AuthService} 的密码哈希逻辑单元测试</b>
 * <p>通过反射测试 {@code hashPassword} 与 {@code verifyPassword} 方法的正确性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class AuthServiceTest
{
    private static final String TEST_PASSWORD = "SecurePass123!";

    /**
     * 通过反射调用 AuthService.hashPassword 来验证 SHA-256 哈希的一致性.
     */
    private static String invokeHashPassword(String password) throws Exception
    {
        final var method = AuthService.class.getDeclaredMethod("hashPassword", String.class);
        method.setAccessible(true);
        return (String) method.invoke(null, password);
    }

    /**
     * 通过反射调用 AuthService.verifyPassword 来验证密码校验逻辑.
     */
    private static boolean invokeVerifyPassword(String rawPassword, String storedHash) throws Exception
    {
        final var method = AuthService.class.getDeclaredMethod("verifyPassword", String.class, String.class);
        method.setAccessible(true);
        return (boolean) method.invoke(null, rawPassword, storedHash);
    }

    @Test
    void hashPassword_SameInput_ShouldProduceSameHash() throws Exception
    {
        final var hash1 = invokeHashPassword(TEST_PASSWORD);
        final var hash2 = invokeHashPassword(TEST_PASSWORD);
        assertEquals(hash1, hash2);
    }

    @Test
    void hashPassword_DifferentInput_ShouldProduceDifferentHashes() throws Exception
    {
        final var hash1 = invokeHashPassword("password1");
        final var hash2 = invokeHashPassword("password2");
        assertNotEquals(hash1, hash2);
    }

    @Test
    void hashPassword_ShouldBeSha256Hex() throws Exception
    {
        final var hash = invokeHashPassword(TEST_PASSWORD);
        //* SHA-256 产生 64 个十六进制字符.
        assertEquals(64, hash.length());
        assertTrue(hash.matches("[0-9a-f]{64}"));
    }

    @Test
    void verifyPassword_CorrectPassword_ShouldReturnTrue() throws Exception
    {
        final var hash = invokeHashPassword(TEST_PASSWORD);
        assertTrue(invokeVerifyPassword(TEST_PASSWORD, hash));
    }

    @Test
    void verifyPassword_WrongPassword_ShouldReturnFalse() throws Exception
    {
        final var hash = invokeHashPassword(TEST_PASSWORD);
        assertFalse(invokeVerifyPassword("wrong-password", hash));
    }

    @Test
    void hashPassword_EmptyString_ShouldProduceValidHash() throws Exception
    {
        //* 验证空密码也能正常哈希, 不抛出异常.
        final var hash = invokeHashPassword("");
        assertEquals(64, hash.length());
    }

    @Test
    void hashPassword_MatchesDirectSha256() throws Exception
    {
        //* 验证 AuthService 内部使用的哈希算法与标准 SHA-256 一致.
        final var password = "一致性验证";
        final var authHash = invokeHashPassword(password);

        final var digest = MessageDigest.getInstance("SHA-256");
        final var expectedHash = HexFormat.of().formatHex(digest.digest(password.getBytes()));

        assertEquals(expectedHash, authHash);
    }

    @Test
    void hashPassword_WithUnicodeCharacters() throws Exception
    {
        //* 验证包含 Unicode 字符的密码也能正常哈希.
        final var password = "密码🔑123";
        final var hash = invokeHashPassword(password);
        assertEquals(64, hash.length());
    }
}