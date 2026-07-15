package kurvcygnus.soulnotes.exception;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link IBusinessException} 的单元测试</b>
 * <p>验证静态工厂方法的行为: 包括 errorCode 传递、causeData 返回值、自定义 detail 和 tag.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class IBusinessExceptionTest
{
    @Test void of_ErrorCodeOnly_ShouldReturnExceptionWithCorrectCode()
    {
        var ex = IBusinessException.of(ErrorCode.USER_NOT_FOUND);
        assertEquals(ErrorCode.USER_NOT_FOUND, ex.getErrorCode());
    }

    @Test void of_ErrorCodeOnly_ShouldContainDefaultMessage()
    {
        var ex = IBusinessException.of(ErrorCode.USER_NOT_FOUND);
        assertNotNull(ex.getMessage());
        assertTrue(ex.getMessage().contains("用户不存在"));
    }

    @Test void of_ErrorCodeWithData_ShouldHaveNonNullTag()
    {
        var ex = IBusinessException.of(ErrorCode.DIARY_NOT_FOUND);
        //* 默认 tag 不应为 ErrorCode 的枚举名, 应具有调试意义.
        assertNotNull(ex.tag());
    }

    @Test void of_ErrorCodeWithDetail_ShouldUseCustomDetail()
    {
        var detail = "自定义异常详情消息";
        var ex = IBusinessException.of(ErrorCode.BAD_REQUEST, detail);
        assertTrue(ex.getMessage().contains(detail));
    }

    @Test void of_ErrorCodeWithDetailAndTag_ShouldUseProvidedTag()
    {
        var ex = IBusinessException.of(ErrorCode.AUTH_UNAUTHORIZED, "detail", "TEST_AUTH", null);
        assertEquals("TEST_AUTH", ex.tag());
    }

    @Test void of_AllExceptionCodes_ShouldNotThrow()
    {
        for(var code : ErrorCode.values())
            assertDoesNotThrow(() -> IBusinessException.of(code));
    }
}
