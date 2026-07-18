package kurvcygnus.soulnotes.exception;

import kurvcygnus.soulnotes.dto.ApiResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.NoSuchElementException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * <b>{@link GlobalExceptionMapper} 的单元测试</b>
 * <p>验证业务异常能正确映射为统一 JSON 错误响应.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class GlobalExceptionMapperTest
{
    private GlobalExceptionMapper mapper;

    @BeforeEach void setUp() { mapper = new GlobalExceptionMapper(); }

    @Test void toResponse_ShouldReturnCorrectHttpStatus()
    {
        final var ex = (StructuredException) IBusinessException.of(
            ErrorCode.USER_NOT_FOUND, "用户不存在", NoSuchElementException::new, "AUTH_LOGIN_USER_NOT_FOUND");
        try(final var response = mapper.toResponse(ex)) { assertEquals(404, response.getStatus()); }
    }

    @Test void toResponse_ShouldContainApiErrorBody()
    {
        final var ex = IBusinessException.of(
            ErrorCode.USERNAME_DUPLICATE,
            "用户名已被占用",
            RuntimeException::new,
            "AUTH_REGISTER_USERNAME_CONFLICT"
        ).asException();
        try(final var response = mapper.toResponse(ex)) { assertInstanceOf(ApiResponse.class, response.getEntity()); }
    }

    @Test void toResponse_ShouldHaveCorrectErrorCode()
    {
        final var ex = IBusinessException.of(
            ErrorCode.AUTH_UNAUTHORIZED,
            "密码错误",
            IllegalStateException::new,
            "AUTH_LOGIN_PASSWORD_MISMATCH"
        ).asException();
        final var response = mapper.toResponse(ex);
        final var body = (ApiResponse<?>) response.getEntity();
        assertEquals(401003, body.code);
    }

    @Test void toResponse_ShouldUseErrorCodeHttpStatus()
    {
        for(var code : ErrorCode.values())
        {
            if(code == ErrorCode.SUCCESS) continue;
            final var ex = IBusinessException.of(
                code,
                code.getMessage(),
                RuntimeException::new,
                "TEST_" + code.name()
            ).asException();
            var response = mapper.toResponse(ex);
            assertEquals(code.getHttpStatus(), response.getStatus());
        }
    }
}
