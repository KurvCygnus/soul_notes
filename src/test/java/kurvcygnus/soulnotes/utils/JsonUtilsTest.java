package kurvcygnus.soulnotes.utils;

import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link JsonUtils} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class JsonUtilsTest
{
    @Test void toJson_ShouldSerializeSimpleObject()
    {
        final var result = JsonUtils.toJson(Map.of("key", "value"));
        assertTrue(result.contains("\"key\""));
        assertTrue(result.contains("\"value\""));
    }

    @Test void toJson_ShouldSerializeList()
    {
        final var list = List.of("a", "b", "c");
        final var json = JsonUtils.toJson(list);
        assertEquals("[\"a\",\"b\",\"c\"]", json);
    }

    @Test void parseJson_ShouldDeserializeToGivenClass()
    {
        final var json = "{\"name\":\"test\",\"value\":42}";
        final var result = JsonUtils.parseJson(json, Map.class);
        assertInstanceOf(Map.class, result);
    }

    @Test void parseJson_WithTypeReference_ShouldHandleGenericTypes()
    {
        final var json = "[{\"role\":\"user\",\"content\":\"hello\"},{\"role\":\"assistant\",\"content\":\"hi\"}]";
        final var list = JsonUtils.parseJson(json, new TypeReference<List<Map<String, String>>>() {});
        assertEquals(2, list.size());
        assertEquals("user", list.get(0).get("role"));
        assertEquals("hello", list.get(0).get("content"));
        assertEquals("assistant", list.get(1).get("role"));
        assertEquals("hi", list.get(1).get("content"));
    }

    @Test void parseJson_WithComplexNestedStructure()
    {
        final var json = "{\"positive\":0.8,\"negative\":0.2,\"anxiety\":0.1,\"weather\":\"sunny\"}";
        final var map = JsonUtils.parseJson(json, new TypeReference<Map<String, Object>>() {});
        assertEquals(0.8, (double) map.get("positive"), 0.001);
        assertEquals("sunny", map.get("weather"));
    }

    @Test void toJsonAndParseJson_ShouldBeRoundTripSafe()
    {
        final var original = Map.of(
            "id", 1,
            "content", "测试内容",
            "tags", List.of("a", "b")
        );
        final var json = JsonUtils.toJson(original);
        final var restored = JsonUtils.parseJson(json, new TypeReference<Map<String, Object>>() {});
        assertEquals(original.get("id"), restored.get("id"));
        assertEquals(original.get("content"), restored.get("content"));
    }

    @Test void parseJson_WithInvalidJson_ShouldThrowRuntimeException()
    {
        assertThrows(RuntimeException.class, () -> JsonUtils.parseJson("{invalid}", Map.class));
    }
}