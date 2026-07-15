package kurvcygnus.soulnotes.utils.lint;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 该注解表示一个方法由于<b>涉及反射或者其它的元编程能力</b>, 不可以被随意包装, 只应该和可以被直接调用.
 * @implNote <i>冷知识: JDK内部存在这个注解, 但无法被外部使用.</i>
 * @author Kurv Cygnus
 */
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.METHOD)
public @interface CallerSensitive
{
    /**
     * 用于记录注解方法为什么是调用者敏感的字段值.
     */
    String value() default "";
}
