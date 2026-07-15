package kurvcygnus.soulnotes.exception;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import kurvcygnus.soulnotes.dto.ApiResponse;
import org.jetbrains.annotations.NotNull;

/**
 * <b>全局业务异常映射器</b>，将 {@link IBusinessException} 统一转换为 JSON 错误响应。<br>
 * 拦截所有业务异常，提取 {@link ErrorCode} 中的 HTTP 状态码和错误信息，
 * 以 {@link ApiResponse#error(ErrorCode)} 格式返回。<hr>
 *
 * @author Kurv Cygnus & Claude Code
 * @since 1.1
 */
@Provider
public final class GlobalExceptionMapper implements ExceptionMapper<HolderException>
{
    @Override
    public @NotNull Response toResponse(@NotNull HolderException exception)
    {
        final var errorCode = exception.getErrorCode();
        return Response.status(errorCode.getHttpStatus()).
            entity(ApiResponse.error(errorCode)).
            build();
    }
}
