package kurvcygnus.soulnotes.domain.extension;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.json.JsonArraySchema;
import dev.langchain4j.model.chat.request.json.JsonEnumSchema;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.service.tool.AiServiceTool;
import dev.langchain4j.service.tool.ToolExecutor;
import dev.langchain4j.service.tool.ToolProviderRequest;
import dev.langchain4j.service.tool.ToolProviderResult;
import jakarta.enterprise.inject.Instance;
import org.junit.jupiter.api.Test;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ExtensionToolProvider} 规格合成与执行器测试</b> (spec D5): 无 {@code aiCallCommand()} 的
 * 扩展不产生规格; 有者按命令名/说明/参数树合成规格 (enum → JsonEnumSchema); 执行器 round-trip
 * (JSON args → 反序列化 → query → JSON 文本); query 抛异常与 memoryId 非 UUID 均落固定降级文本不外抛.
 *
 * @author Claude Code
 * @since 1.7.0
 */
class ExtensionToolProviderTest
{
    //* 工具调用兜底降级文本 (spec 固定文案, 锁死契约防漂移).
    private static final String FALLBACK = "该查询暂时不可用";

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    //* 单字符串参数载体: 执行器 round-trip 的 Jackson 反序列化目标.
    record DateArgs(String date) {}

    //* 嵌套对象载体: 验证嵌套 ObjectNode 递归适配.
    record Range(Integer days) {}

    //* 多形态参数载体: enum/整数/布尔/数值/字符串数组/嵌套对象 全节点形态覆盖.
    record MoodArgs(String mood, Integer limit, Boolean flagged, Double score, List<String> tags, Range range) {}

    //* 按日期查询扩展: 规格合成 + 执行器 round-trip 的真实载体.
    static final class DatedExtension implements IDataExtension<Map<String, Object>, DateArgs>
    {
        @Override public String name() { return "dated-ext"; }
        @Override public Class<DateArgs> argsType() { return DateArgs.class; }
        @Override public Map<String, Object> query(UUID userId, DateArgs args) { return Map.of("userId", userId.toString(), "date", args.date()); }
        @Override public LLMToolSpec aiCallCommand()
        {
            return new LLMToolSpec("query_by_date", "按日期查询日程安排",
                Schema.builder().stringProperty("date", "查询日期, 格式 2026-10-03").required("date").build());
        }
    }

    //* 全形态扩展: ISchemaNode 六种节点 → langchain4j JSON schema 的适配覆盖.
    static final class MoodExtension implements IDataExtension<List<String>, MoodArgs>
    {
        @Override public String name() { return "mood-ext"; }
        @Override public Class<MoodArgs> argsType() { return MoodArgs.class; }
        @Override public List<String> query(UUID userId, MoodArgs args) { return List.of("calm"); }
        @Override public LLMToolSpec aiCallCommand()
        {
            return new LLMToolSpec("query_mood", "查询心情记录",
                Schema.builder()
                    .stringEnumProperty("mood", "心情", List.of("calm", "low"))
                    .integerProperty("limit", "条数上限")
                    .boolProperty("flagged", "是否标记")
                    .numberProperty("score", "分数")
                    .arrayOfStringsProperty("tags", "标签")
                    .objectProperty("range", b -> b.integerProperty("days", "天数"))
                    .build());
        }
    }

    //* 仅 REST 出口扩展: 不声明工具契约, 不得产生任何规格.
    static final class RestOnlyExtension implements IDataExtension<List<String>, DateArgs>
    {
        @Override public String name() { return "rest-only"; }
        @Override public Class<DateArgs> argsType() { return DateArgs.class; }
        @Override public List<String> query(UUID userId, DateArgs args) { return List.of(); }
        @Override public LLMToolSpec aiCallCommand() { return null; }
    }

    //* 故障扩展: query 必抛, 验证 fail-open 兜底缝不外抛.
    static final class BrokenExtension implements IDataExtension<List<String>, DateArgs>
    {
        @Override public String name() { return "broken-ext"; }
        @Override public Class<DateArgs> argsType() { return DateArgs.class; }
        @Override public List<String> query(UUID userId, DateArgs args) { throw new IllegalStateException("boom"); }
        @Override public LLMToolSpec aiCallCommand()
        {
            return new LLMToolSpec("query_broken", "必然故障的查询",
                Schema.builder().stringProperty("date", "查询日期").build());
        }
    }

    private ExtensionToolProvider provider(IDataExtension<?, ?>... beans)
    {
        return new ExtensionToolProvider(new ExtensionRegistry(fake(beans), new ObjectMapper()), new ObjectMapper());
    }

    private static ToolProviderRequest request() { return new ToolProviderRequest(USER_ID, UserMessage.from("你好")); }

    private static ToolExecutionRequest toolRequest(String name, String arguments)
    {
        return ToolExecutionRequest.builder().id("test-call").name(name).arguments(arguments).build();
    }

    //* ToolProviderResult 的 1.14 版内取用面已整体废弃 (spec 零废弃 API 铁律), 经 aiServiceTools() 自行按名检索.
    private static ToolSpecification specByName(ToolProviderResult result, String name)
    {
        return result.aiServiceTools().stream().map(AiServiceTool::toolSpecification).filter(t -> t.name().equals(name)).findFirst().orElse(null);
    }

    private static ToolExecutor executorByName(ToolProviderResult result, String name)
    {
        return result.aiServiceTools().stream().filter(t -> t.name().equals(name)).map(AiServiceTool::toolExecutor).findFirst().orElse(null);
    }

    //* 与 ExtensionRegistryTest 同形的 fake Instance (收集测试扩展, 免容器).
    private static Instance<IDataExtension<?, ?>> fake(IDataExtension<?, ?>... beans)
    {
        final var list = List.of(beans);
        return new Instance<>()
        {
            @Override public Iterator<IDataExtension<?, ?>> iterator() { return list.iterator(); }
            @Override public IDataExtension<?, ?> get() { return list.getFirst(); }
            @Override public boolean isUnsatisfied() { return list.isEmpty(); }
            @Override public boolean isAmbiguous() { return list.size() > 1; }
            @Override public void destroy(IDataExtension<?, ?> bean) { throw new UnsupportedOperationException(); }
            @Override public jakarta.enterprise.inject.Instance.Handle<IDataExtension<?, ?>> getHandle() { throw new UnsupportedOperationException(); }
            @Override public Iterable<? extends Instance.Handle<IDataExtension<?, ?>>> handles() { throw new UnsupportedOperationException(); }
            @Override public Instance<IDataExtension<?, ?>> select(java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
            @Override public <U extends IDataExtension<?, ?>> Instance<U> select(Class<U> subtype, java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
            @Override public <U extends IDataExtension<?, ?>> Instance<U> select(jakarta.enterprise.util.TypeLiteral<U> typeLiteral, java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
        };
    }

    @Test void provideTools_RestOnlyExtension_ShouldReturnEmptyResult()
    {
        assertTrue(provider(new RestOnlyExtension()).provideTools(request()).aiServiceTools().isEmpty());
    }

    @Test void provideTools_WithAiCommand_ShouldSynthesizeSpecification()
    {
        final var spec = specByName(provider(new DatedExtension()).provideTools(request()), "query_by_date");
        assertNotNull(spec);
        assertEquals("按日期查询日程安排", spec.description());
        assertNotNull(spec.parameters());
        assertTrue(spec.parameters().required().contains("date"));
        assertNotNull(spec.parameters().properties().get("date"));
    }

    @Test void provideTools_ShouldAdaptAllNodeShapes()
    {
        final var spec = specByName(provider(new MoodExtension()).provideTools(request()), "query_mood");
        assertNotNull(spec);
        final var parameters = spec.parameters();
        assertNotNull(parameters);
        final var mood = assertInstanceOf(JsonEnumSchema.class, parameters.properties().get("mood"));
        assertEquals(List.of("calm", "low"), mood.enumValues());
        assertNotNull(parameters.properties().get("limit"));
        assertNotNull(parameters.properties().get("flagged"));
        assertNotNull(parameters.properties().get("score"));
        assertInstanceOf(JsonArraySchema.class, parameters.properties().get("tags"));
        final var range = assertInstanceOf(JsonObjectSchema.class, parameters.properties().get("range"));
        assertNotNull(range.properties().get("days"));
    }

    @Test void executor_ShouldRoundTripArgumentsThroughQuery()
    {
        final var executor = executorByName(provider(new DatedExtension()).provideTools(request()), "query_by_date");
        assertNotNull(executor);
        final var output = executor.execute(toolRequest("query_by_date", "{\"date\":\"2026-10-08\"}"), USER_ID.toString());
        assertTrue(output.contains("2026-10-08"));
        assertTrue(output.contains(USER_ID.toString()));
    }

    @Test void executor_WhenQueryThrows_ShouldReturnFallbackText()
    {
        final var executor = executorByName(provider(new BrokenExtension()).provideTools(request()), "query_broken");
        assertNotNull(executor);
        assertEquals(FALLBACK, executor.execute(toolRequest("query_broken", "{\"date\":\"2026-10-08\"}"), USER_ID.toString()));
    }

    @Test void executor_WhenMemoryIdNotUuid_ShouldReturnFallbackText()
    {
        final var executor = executorByName(provider(new DatedExtension()).provideTools(request()), "query_by_date");
        assertNotNull(executor);
        assertEquals(FALLBACK, executor.execute(toolRequest("query_by_date", "{\"date\":\"2026-10-08\"}"), "not-a-uuid"));
    }
}
