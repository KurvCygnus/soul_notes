package kurvcygnus.soulnotes.domain.auth.dto;

import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>认证模块 DTO 单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class AuthDtoTest
{
    @Test void loginRequest_ShouldStoreFields()
    {
        final var req = new LoginRequest("testuser", "password123");
        assertEquals("testuser", req.username());
        assertEquals("password123", req.password());
    }

    //! @NotNull 注解在运行时不进行空值校验, 因此不测试 null 参数构造.

    @Test void registerRequest_ShouldStoreFields()
    {
        final var req = new RegisterRequest("newuser", "securePwd1", UserRole.STUDENT);
        assertEquals("newuser", req.username());
        assertEquals("securePwd1", req.password());
        assertEquals(UserRole.STUDENT, req.role());
    }

    @Test void registerRequest_WithCounselorRole()
    {
        final var req = new RegisterRequest("counselor1", "pwd", UserRole.COUNSELOR);
        assertEquals(UserRole.COUNSELOR, req.role());
    }

    @Test void authResponse_ShouldStoreAllFields()
    {
        final var userId = UUID.randomUUID();
        final var resp = new AuthResponse("jwt-token-xyz", userId, "testuser", UserRole.ADMIN);
        assertEquals("jwt-token-xyz", resp.token());
        assertEquals(userId, resp.userId());
        assertEquals("testuser", resp.username());
        assertEquals(UserRole.ADMIN, resp.role());
    }

    //! @NotNull 注解在运行时不进行空值校验, 因此不测试 null token 构造.
}