package kurvcygnus.soulnotes.exception;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ErrorCode} 的单元测试</b>
 * <p>验证每个枚举项的 HTTP 状态码、错误码、消息三者一致性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class ErrorCodeTest
{
    @Test void success_ShouldHaveHttp200AndCodeZero()
    {
        assertEquals(200, ErrorCode.SUCCESS.getHttpStatus());
        assertEquals(0, ErrorCode.SUCCESS.getCode());
        assertEquals("success", ErrorCode.SUCCESS.getMessage());
    }

    @Test void badRequest_ShouldHaveHttp400()
    {
        assertEquals(400, ErrorCode.BAD_REQUEST.getHttpStatus());
        assertEquals(400000, ErrorCode.BAD_REQUEST.getCode());
    }

    @Test void authTokenExpired_ShouldHaveCorrectFields()
    {
        assertEquals(401, ErrorCode.AUTH_TOKEN_EXPIRED.getHttpStatus());
        assertEquals(401001, ErrorCode.AUTH_TOKEN_EXPIRED.getCode());
        assertEquals("Token 已过期", ErrorCode.AUTH_TOKEN_EXPIRED.getMessage());
    }

    @Test void authTokenInvalid_ShouldHaveCorrectFields()
    {
        assertEquals(401, ErrorCode.AUTH_TOKEN_INVALID.getHttpStatus());
        assertEquals(401002, ErrorCode.AUTH_TOKEN_INVALID.getCode());
        assertEquals("Token 无效", ErrorCode.AUTH_TOKEN_INVALID.getMessage());
    }

    @Test void authUnauthorized_ShouldHaveCorrectFields()
    {
        assertEquals(401, ErrorCode.AUTH_UNAUTHORIZED.getHttpStatus());
        assertEquals(401003, ErrorCode.AUTH_UNAUTHORIZED.getCode());
        assertEquals("未登录", ErrorCode.AUTH_UNAUTHORIZED.getMessage());
    }

    @Test void authForbidden_ShouldHaveCorrectFields()
    {
        assertEquals(403, ErrorCode.AUTH_FORBIDDEN.getHttpStatus());
        assertEquals(403001, ErrorCode.AUTH_FORBIDDEN.getCode());
        assertEquals("权限不足", ErrorCode.AUTH_FORBIDDEN.getMessage());
    }

    @Test void userNotFound_ShouldHaveCorrectFields()
    {
        assertEquals(404, ErrorCode.USER_NOT_FOUND.getHttpStatus());
        assertEquals(404001, ErrorCode.USER_NOT_FOUND.getCode());
        assertEquals("用户不存在", ErrorCode.USER_NOT_FOUND.getMessage());
    }

    @Test void usernameDuplicate_ShouldHaveHttp409()
    {
        assertEquals(409, ErrorCode.USERNAME_DUPLICATE.getHttpStatus());
        assertEquals(409001, ErrorCode.USERNAME_DUPLICATE.getCode());
    }

    @Test void diaryNotFound_ShouldHaveCorrectFields()
    {
        assertEquals(404, ErrorCode.DIARY_NOT_FOUND.getHttpStatus());
        assertEquals(404010, ErrorCode.DIARY_NOT_FOUND.getCode());
        assertEquals("日记不存在", ErrorCode.DIARY_NOT_FOUND.getMessage());
    }

    @Test void sessionNotFound_ShouldHaveCorrectFields()
    {
        assertEquals(404, ErrorCode.SESSION_NOT_FOUND.getHttpStatus());
        assertEquals(404020, ErrorCode.SESSION_NOT_FOUND.getCode());
        assertEquals("会话不存在", ErrorCode.SESSION_NOT_FOUND.getMessage());
    }

    @Test void aiServiceDown_ShouldHaveHttp503()
    {
        assertEquals(503, ErrorCode.AI_SERVICE_DOWN.getHttpStatus());
        assertEquals(503001, ErrorCode.AI_SERVICE_DOWN.getCode());
        assertEquals("AI 服务暂不可用", ErrorCode.AI_SERVICE_DOWN.getMessage());
    }

    @Test void allErrorCodes_ShouldHaveUniqueCodeValues()
    {
        final var codes = java.util.stream.Stream.of(ErrorCode.values())
            .map(ErrorCode::getCode)
            .toList();
        //* 验证所有错误码不重复 — 确保错误码体系的唯一性.
        assertEquals(codes.size(), java.util.Set.copyOf(codes).size());
    }
}