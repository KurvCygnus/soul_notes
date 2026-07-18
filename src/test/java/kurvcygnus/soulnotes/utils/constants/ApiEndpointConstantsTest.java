package kurvcygnus.soulnotes.utils.constants;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ApiEndpointConstants} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class ApiEndpointConstantsTest
{
    @Test void authBase_ShouldStartWithSlash() { assertTrue(ApiEndpointConstants.AUTH_BASE.startsWith("/")); }

    @Test void diaryBase_ShouldStartWithSlash() { assertTrue(ApiEndpointConstants.DIARY_BASE.startsWith("/")); }

    @Test void chatBase_ShouldStartWithSlash() { assertTrue(ApiEndpointConstants.CHAT_BASE.startsWith("/")); }

    @Test void authBase_ShouldBeExpected() { assertEquals("/api/v1/auth", ApiEndpointConstants.AUTH_BASE); }

    @Test void diaryBase_ShouldBeExpected() { assertEquals("/api/v1/diaries", ApiEndpointConstants.DIARY_BASE); }

    @Test void chatBase_ShouldBeExpected() { assertEquals("/api/v1/chat", ApiEndpointConstants.CHAT_BASE); }
}
