package kurvcygnus.soulnotes.utils.enums;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link UserRole} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class UserRoleTest
{
    @Test void shouldHaveThreeRoles()
    {
        final var roles = UserRole.values();
        assertEquals(3, roles.length);
    }

    @Test void student_ShouldExist() { assertEquals(UserRole.STUDENT, UserRole.valueOf("STUDENT")); }

    @Test void counselor_ShouldExist() { assertEquals(UserRole.COUNSELOR, UserRole.valueOf("COUNSELOR")); }

    @Test void admin_ShouldExist() { assertEquals(UserRole.ADMIN, UserRole.valueOf("ADMIN")); }
}