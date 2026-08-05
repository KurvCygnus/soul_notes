package kurvcygnus.soulnotes.domain.chat.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ChatService} 反射单元测试</b>
 * <p>通过反射验证私有辅助方法的正确性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class ChatServiceTest
{
    //region countMessages
    @Test void countMessages_NullInput_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages", String.class);
        assertEquals(0, method.invoke(null, (String) null));
    }

    @Test void countMessages_BlankInput_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages", String.class);
        assertEquals(0, method.invoke(null, ""));
    }

    @Test void countMessages_EmptyArray_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages", String.class);
        assertEquals(0, method.invoke(null, "[]"));
    }

    @Test void countMessages_SingleMessage_ShouldReturnOne() throws Exception
    {
        final var method  = getStaticMethod("countMessages", String.class);
        final var json    = "[{\"role\":\"user\",\"content\":\"hello\"}]";
        assertEquals(1, method.invoke(null, json));
    }

    @Test void countMessages_MultipleMessages_ShouldReturnCount() throws Exception
    {
        final var method = getStaticMethod("countMessages", String.class);
        final var json   = "[{\"role\":\"user\",\"content\":\"a\"},{\"role\":\"assistant\",\"content\":\"b\"}]";
        assertEquals(2, method.invoke(null, json));
    }

    @Test void countMessages_InvalidJson_ShouldReturnZero() throws Exception
    {
        final var method = getStaticMethod("countMessages", String.class);
        assertEquals(0, method.invoke(null, "{invalid}"));
    }
    //endregion

    //region getPreview
    @Test void getPreview_NullInput_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview", String.class);
        assertEquals("", method.invoke(null, (String) null));
    }

    @Test void getPreview_BlankInput_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview", String.class);
        assertEquals("", method.invoke(null, ""));
    }

    @Test void getPreview_EmptyArray_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview", String.class);
        assertEquals("", method.invoke(null, "[]"));
    }

    @Test void getPreview_ShortContent_ShouldReturnFull() throws Exception
    {
        final var method = getStaticMethod("getPreview", String.class);
        final var json   = "[{\"role\":\"user\",\"content\":\"今天心情不错\"}]";
        assertEquals("今天心情不错", method.invoke(null, json));
    }

    @Test void getPreview_LongContent_ShouldTruncate() throws Exception
    {
        final var method  = getStaticMethod("getPreview", String.class);
        final var content = "a".repeat(100);
        final var json    = "[{\"role\":\"user\",\"content\":\"" + content + "\"}]";
        final var result  = (String) method.invoke(null, json);
        assertTrue(result.endsWith("..."));
        assertEquals(53, result.length()); //* 50 + "..."
    }

    @Test void getPreview_InvalidJson_ShouldReturnEmpty() throws Exception
    {
        final var method = getStaticMethod("getPreview", String.class);
        assertEquals("", method.invoke(null, "{broken"));
    }
    //endregion

    //region 反射工具
    private static Method getStaticMethod(String name, Class<?>... paramTypes) throws NoSuchMethodException
    {
        final var method = ChatService.class.getDeclaredMethod(name, paramTypes);
        assertTrue(Modifier.isStatic(method.getModifiers()), "方法 " + name + " 应为 static");
        assertTrue(Modifier.isPrivate(method.getModifiers()), "方法 " + name + " 应为 private");
        method.setAccessible(true);
        return method;
    }
    //endregion
}
