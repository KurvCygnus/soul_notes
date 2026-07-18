package kurvcygnus.soulnotes.exception;

import org.junit.jupiter.api.Test;

import java.util.NoSuchElementException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link IBusinessException} 的单元测试</b>
 * <p>验证静态工厂方法的行为: 包括 errorCode 传递、tag 赋值、自定义 message 和 factory.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class IBusinessExceptionTest
{
    @Test void of_WithFactoryAndTag_ShouldReturnExceptionWithCorrectCode()
    {
        var ex = IBusinessException.of(ErrorCode.USER_NOT_FOUND, "用户不存在", NoSuchElementException::new, "AUTH_LOGIN_USER_NOT_FOUND");
        assertEquals(ErrorCode.USER_NOT_FOUND, ((IBusinessException<?>) ex).getErrorCode());
    }

    @Test void of_WithFactoryAndTag_ShouldContainDetailMessage()
    {
        var ex = IBusinessException.of(ErrorCode.USER_NOT_FOUND, "用户不存在", NoSuchElementException::new, "AUTH_LOGIN_USER_NOT_FOUND");
        assertNotNull(ex.getMessage());
        assertTrue(ex.getMessage().contains("用户不存在"));
    }

    @Test void of_WithFactoryAndTag_ShouldHaveNonNullTag()
    {
        var ex = IBusinessException.of(ErrorCode.DIARY_NOT_FOUND, "日记不存在", NoSuchElementException::new, "DIARY_READ_RECORD_NOT_FOUND");
        assertNotNull(ex.tag());
    }

    @Test void of_WithCustomDetail_ShouldUseCustomDetail()
    {
        var detail = "自定义异常详情消息";
        var ex = IBusinessException.of(ErrorCode.BAD_REQUEST, detail, IllegalArgumentException::new, "TEST_VALIDATION");
        assertTrue(ex.getMessage().contains(detail));
    }

    @Test void of_WithProvidedTag_ShouldUseProvidedTag()
    {
        var ex = IBusinessException.of(ErrorCode.AUTH_UNAUTHORIZED, "detail", IllegalStateException::new, "TEST_AUTH");
        assertEquals("TEST_AUTH", ex.tag());
    }

    @Test void of_AllExceptionCodes_ShouldNotThrow()
    {
        for(var code : ErrorCode.values())
            assertDoesNotThrow(() -> IBusinessException.of(code, code.getMessage(), RuntimeException::new, "TEST_" + code.name()));
    }
}
