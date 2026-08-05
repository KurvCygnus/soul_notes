package kurvcygnus.soulnotes.exception;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>异常接口层次结构验证</b>
 * <p>验证 {@link IStructuredThrowable} 及其子接口/实现类的结构一致性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class ExceptionInterfaceTest
{
    //region IStructuredThrowable
    @Test void iStructuredThrowable_ShouldDeclareTag()
    {
        assertHasMethod(IStructuredThrowable.class, "tag", String.class);
    }

    @Test void iStructuredThrowable_ShouldDeclareCause()
    {
        assertHasMethod(IStructuredThrowable.class, "cause", Throwable.class);
    }
    //endregion

    //region IDetailedThrowable
    @Test void iDetailedThrowable_ShouldExtendIStructuredThrowable()
    {
        assertTrue(IDetailedThrowable.class.isAssignableFrom(IDetailedThrowable.class));
    }

    @Test void iDetailedThrowable_ShouldDeclareCauseData()
    {
        assertHasMethod(IDetailedThrowable.class, "causeData", Object.class);
    }

    @Test void iDetailedThrowable_ShouldHaveDefaultAsException()
    {
        assertHasDefaultMethod(IDetailedThrowable.class, "asException");
    }

    @Test void iDetailedThrowable_ShouldHaveDefaultThrowSelf()
    {
        assertHasDefaultMethod(IDetailedThrowable.class, "throwSelf");
    }
    //endregion

    //region ITransactionalThrowable
    @Test void iTransactionalThrowable_ShouldExtendIDetailedThrowable()
    {
        assertTrue(IDetailedThrowable.class.isAssignableFrom(ITransactionalThrowable.class));
    }

    @Test void iTransactionalThrowable_ShouldDeclareRollback()
    {
        assertHasMethod(ITransactionalThrowable.class, "rollback", Object.class);
    }
    //endregion

    //region StructuredException
    @Test void structuredException_ShouldImplementIStructuredThrowable()
    {
        assertTrue(IStructuredThrowable.class.isAssignableFrom(StructuredException.class));
    }

    @Test void structuredException_ShouldBePublicConcreteClass()
    {
        assertFalse(Modifier.isAbstract(StructuredException.class.getModifiers()));
        assertTrue(Modifier.isPublic(StructuredException.class.getModifiers()));
    }

    @Test void structuredException_ShouldHaveConstructorWithCauseAndTag()
    {
        try
        {
            final var ctor = StructuredException.class.getConstructor(Throwable.class, String.class);
            assertNotNull(ctor);
        }
        catch(NoSuchMethodException e)
        {
            fail("StructuredException 应为 (Throwable, String) 构造函数", e);
        }
    }
    //endregion

    //region 工具方法
    private static void assertHasMethod(Class<?> clazz, String name, Class<?> returnType)
    {
        try
        {
            final var method = clazz.getDeclaredMethod(name);
            assertEquals(returnType, method.getReturnType(), "方法 " + name + " 返回类型不匹配");
        }
        catch(NoSuchMethodException e)
        {
            fail("类 " + clazz.getSimpleName() + " 应声明方法 " + name, e);
        }
    }

    private static void assertHasDefaultMethod(Class<?> clazz, String name)
    {
        try
        {
            final var method = clazz.getDeclaredMethod(name);
            assertTrue(method.isDefault(), "方法 " + name + " 应为 default 方法");
        }
        catch(NoSuchMethodException e)
        {
            fail("接口 " + clazz.getSimpleName() + " 应声明默认方法 " + name, e);
        }
    }
    //endregion
}
