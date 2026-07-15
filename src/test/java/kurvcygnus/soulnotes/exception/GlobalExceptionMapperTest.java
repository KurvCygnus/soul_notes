package kurvcygnus.soulnotes.exception;

import jakarta.ws.rs.core.Response;
import kurvcygnus.soulnotes.dto.ApiResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link GlobalExceptionMapper} 的单元测试</b>
 * <p>验证 {@link IBusinessException} 能正确映射为统一 JSON 错误响应.</p>
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
        var ex = IBusinessException.of(ErrorCode.USER_NOT_FOUND);
        var response = mapper.toResponse(ex);
        assertEquals(404, response.getStatus());
    }

    @Test void toResponse_ShouldContainApiErrorBody()
    {
        var ex = IBusinessException.of(ErrorCode.USERNAME_DUPLICATE);
        var response = mapper.toResponse(ex);
        assertInstanceOf(ApiResponse.class, response.getEntity());
    }

    @Test void toResponse_ShouldHaveCorrectErrorCode()
    {
        var ex = IBusinessException.of(ErrorCode.AUTH_UNAUTHORIZED);
        var response = mapper.toResponse(ex);
        var body = (ApiResponse<?>) response.getEntity();
        assertEquals(401003, body.code);
    }

    @Test void toResponse_ShouldUseErrorCodeHttpStatus()
    {
        for(var code : ErrorCode.values())
        {
            if(code == ErrorCode.SUCCESS) continue;
            var ex = IBusinessException.of(code);
            var response = mapper.toResponse(ex);
            assertEquals(code.getHttpStatus(), response.getStatus());
        }
    }
}
