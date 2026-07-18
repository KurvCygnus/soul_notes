package kurvcygnus.soulnotes.utils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.jetbrains.annotations.NotNull;

/**
 * <b>JSON 工具类</b>
 * <p>基于 Jackson {@link ObjectMapper} 的单例封装, 统一项目中 JSON 序列化/反序列化入口.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
public final class JsonUtils
{
    private JsonUtils() { throw new IllegalAccessError("Class \"JsonUtils\" is not meant to be instantized!"); }

    //* 显式注册 JavaTimeModule, 避免 findAndRegisterModules() 的全 classpath 扫描开销.
    private static final @NotNull ObjectMapper MAPPER = new ObjectMapper().registerModule(new JavaTimeModule());

    /**
     * <span style="color: 95cc6d">将对象序列化为 JSON 字符串.</span>
     */
    public static @NotNull String toJson(@NotNull Object obj)
    {
        try { return MAPPER.writeValueAsString(obj); }
        catch(JsonProcessingException e) { throw new RuntimeException("JSON 序列化失败: " + obj.getClass().getName(), e); }
    }

    /**
     * <span style="color: 95cc6d">将 JSON 字符串反序列化为指定类型.</span>
     */
    public static <T> @NotNull T parseJson(@NotNull String json, @NotNull Class<T> type)
    {
        try { return MAPPER.readValue(json, type); }
        catch(JsonProcessingException e) { throw new RuntimeException("JSON 反序列化失败: " + type.getName(), e); }
    }

    /**
     * <span style="color: 95cc6d">将 JSON 字符串反序列化为泛型类型 (如 {@code List<Map<String, String>>}).</span>
     */
    public static <T> @NotNull T parseJson(@NotNull String json, @NotNull TypeReference<T> typeRef)
    {
        try { return MAPPER.readValue(json, typeRef); }
        catch(JsonProcessingException e) { throw new RuntimeException("JSON 反序列化失败: " + typeRef.getType(), e); }
    }
}