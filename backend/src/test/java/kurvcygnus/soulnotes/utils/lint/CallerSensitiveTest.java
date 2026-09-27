package kurvcygnus.soulnotes.utils.lint;

import org.junit.jupiter.api.Test;

import java.lang.annotation.ElementType;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link CallerSensitive} 注解元数据验证</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class CallerSensitiveTest
{
    @Test void retention_ShouldBeSource()
    {
        final var retention = CallerSensitive.class.getAnnotation(java.lang.annotation.Retention.class);
        assertNotNull(retention);
        assertEquals(RetentionPolicy.SOURCE, retention.value());
    }

    @Test void target_ShouldBeMethod()
    {
        final var target = CallerSensitive.class.getAnnotation(Target.class);
        assertNotNull(target);
        assertArrayEquals(new ElementType[]{ElementType.METHOD}, target.value());
    }

    @Test void value_ShouldHaveDefaultEmptyString()
    {
        try
        {
            final var method = CallerSensitive.class.getDeclaredMethod("value");
            assertNotNull(method);
            final var defaultValue = method.getDefaultValue();
            assertEquals("", defaultValue);
        }
        catch(NoSuchMethodException e)
        {
            fail("注解应声明 value() 方法", e);
        }
    }
}
