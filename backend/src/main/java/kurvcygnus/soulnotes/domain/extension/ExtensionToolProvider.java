package kurvcygnus.soulnotes.domain.extension;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.model.chat.request.json.JsonArraySchema;
import dev.langchain4j.model.chat.request.json.JsonBooleanSchema;
import dev.langchain4j.model.chat.request.json.JsonEnumSchema;
import dev.langchain4j.model.chat.request.json.JsonIntegerSchema;
import dev.langchain4j.model.chat.request.json.JsonNumberSchema;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.request.json.JsonSchemaElement;
import dev.langchain4j.model.chat.request.json.JsonStringSchema;
import dev.langchain4j.service.tool.ToolExecutor;
import dev.langchain4j.service.tool.ToolProvider;
import dev.langchain4j.service.tool.ToolProviderRequest;
import dev.langchain4j.service.tool.ToolProviderResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.utils.PrintUtils;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * 数据扩展 → LLM 工具适配器 (spec D5): 遍历 {@link ExtensionRegistry#tools()} 工具视图, 把纯值契约
 * {@link LLMToolSpec} 动态合成为 langchain4j {@link ToolSpecification} + {@link ToolExecutor},
 * 共情 Agent 经 {@code @RegisterAiService(toolProviderSupplier = CDISupplier.class)} 按调用取用 —
 * 与 {@code tools = {...}} 静态工具并存 (注册表为空时自然退化为零工具).
 *
 * @implNote <b>userId 服务端注入</b>: Agent 的 {@code @MemoryId String userId} 作为执行器 memoryId
 *           透传至此, 按 {@link UUID} 解析后传入 {@link IDataExtension#query} — 身份恒来自调用链,
 *           LLM 参数只承载业务字段, 与 REST 出口同一执行体 (D2).
 *           <b>fail-open 兜底缝</b>: 反序列化/查询/序列化任一失败统一回传固定降级文本并 WARN 留痕,
 *           绝不外抛 — 工具异常面必须收敛为 LLM 可读文本, 而非打断对话.
 *           langchain4j 类型收敛于本文件, SPI 契约 ({@link IDataExtension}/{@link ISchemaNode}) 零框架依赖;
 *           {@link CDISupplier} 须为 CDI bean — quarkus-langchain4j 以容器注入方式消费 supplier, 不走反射 new.
 * @since 1.7.0
 */
@SuppressWarnings({"rawtypes", "unchecked"})//! 裸 IDataExtension 为异构扩展的准确形态 (与 [[ExtensionRegistry]] 同理); 裸 Class 入 readValue 的未检转换由 rawtypes 语义连带, 两者均无运行时风险.
@ApplicationScoped
public final class ExtensionToolProvider implements ToolProvider
{
    private static final org.slf4j.Logger LOG = PrintUtils.getLogger();

    /**
     * 工具执行失败时回传 LLM 的固定降级文本 (spec 固定文案, 对外可见契约).
     */
    public static final String FALLBACK_TEXT = "该查询暂时不可用";

    private final @NotNull ExtensionRegistry registry;
    private final @NotNull ObjectMapper mapper;

    /**
     * CDI 注入入口 (单构造器即 ArC 注入构造), 亦是测试可达路径.
     *
     * @param registry 数据扩展注册表 (工具视图唯一来源)
     * @param mapper   Jackson 序列化器 (参数反序列化/结果序列化, 与 REST 出口同配置)
     */
    public ExtensionToolProvider(@NotNull ExtensionRegistry registry, @NotNull ObjectMapper mapper)
    {
        this.registry = registry;
        this.mapper = mapper;
    }

    /**
     * {@inheritDoc}
     * <p>工具集与 memoryId 无关 (registry 构建期已定), 逐视图合成规格与执行器 —
     * 注册表无工具视图时返回空 result.</p>
     */
    @Override
    public @NotNull ToolProviderResult provideTools(@NotNull ToolProviderRequest request)
    {
        final var builder = ToolProviderResult.builder();
        for(final var view: registry.tools())
            builder.add(specification(view.spec()), executor(view.extension()));
        return builder.build();
    }

    //region 规格合成 (LLMToolSpec → ToolSpecification)

    /**
     * 纯值契约 → langchain4j 规格: 命令名/说明直映射, 参数树经 {@link #toObjectSchema} 适配.
     * <p>根节点非对象 (注册表允许的空查询占位形态) 时不设参数 — 工具退化为无参形态.</p>
     */
    private static @NotNull ToolSpecification specification(@NotNull LLMToolSpec spec)
    {
        final var builder = ToolSpecification.builder()
            .name(spec.command())
            .description(spec.description());
        if(spec.parameters() instanceof ISchemaNode.ObjectNode objectNode)
            builder.parameters(toObjectSchema(objectNode));
        return builder.build();
    }

    /**
     * 对象节点 → {@link JsonObjectSchema}: 属性逐个挂接, description 非空才设, required 集非空才声明.
     */
    private static @NotNull JsonObjectSchema toObjectSchema(@NotNull ISchemaNode.ObjectNode node)
    {
        final var builder = JsonObjectSchema.builder();
        if(node.description() != null)
            builder.description(node.description());
        for(final var entry: node.properties().entrySet())
            addProperty(builder, entry.getKey(), entry.getValue());
        if(!node.required().isEmpty())
            builder.required(List.copyOf(node.required()));
        return builder.build();
    }

    /**
     * 把单个属性节点挂上父 builder: 叶子标量走 {@code addXxxProperty} 捷径, 结构节点先递归成元素再挂.
     */
    private static void addProperty(@NotNull JsonObjectSchema.Builder builder, @NotNull String name, @NotNull ISchemaNode node)
    {
        switch(node)
        {
            case ISchemaNode.StringNode stringNode -> addStringProperty(builder, name, stringNode);
            case ISchemaNode.IntegerNode integerNode -> builder.addIntegerProperty(name, integerNode.description());
            case ISchemaNode.NumberNode numberNode -> builder.addNumberProperty(name, numberNode.description());
            case ISchemaNode.BoolNode boolNode -> builder.addBooleanProperty(name, boolNode.description());
            case ISchemaNode.ArrayNode arrayNode -> builder.addProperty(name, toArraySchema(arrayNode));
            case ISchemaNode.ObjectNode objectNode -> builder.addProperty(name, toObjectSchema(objectNode));
        }
    }

    /**
     * 字符串属性: 有枚举值 → {@link JsonEnumSchema} (约束 LLM 只能填合法值), 否则自由文本.
     */
    private static void addStringProperty(@NotNull JsonObjectSchema.Builder builder, @NotNull String name, @NotNull ISchemaNode.StringNode node)
    {
        if(node.enumValues().isEmpty())
        {
            builder.addStringProperty(name, node.description());
            return;
        }
        final var enumBuilder = JsonEnumSchema.builder().enumValues(node.enumValues());
        if(node.description() != null)
            enumBuilder.description(node.description());
        builder.addProperty(name, enumBuilder.build());
    }

    /**
     * 数组节点 → {@link JsonArraySchema}: description 非空才设, 元素节点递归适配.
     */
    private static @NotNull JsonArraySchema toArraySchema(@NotNull ISchemaNode.ArrayNode node)
    {
        final var builder = JsonArraySchema.builder().items(toElement(node.items()));
        if(node.description() != null)
            builder.description(node.description());
        return builder.build();
    }

    /**
     * 任意节点 → 独立 schema 元素 (数组元素位/嵌套位用): 标量叶子在此处必须显式成形.
     * <p>langchain4j 各 schema builder 的 {@code description(null)} 均为无害留白, 不必逐个判空.</p>
     */
    private static @NotNull JsonSchemaElement toElement(@NotNull ISchemaNode node)
    {
        return switch(node)
        {
            case ISchemaNode.ObjectNode objectNode -> toObjectSchema(objectNode);
            case ISchemaNode.ArrayNode arrayNode -> toArraySchema(arrayNode);
            case ISchemaNode.StringNode stringNode -> stringElement(stringNode);
            case ISchemaNode.IntegerNode integerNode -> JsonIntegerSchema.builder().description(integerNode.description()).build();
            case ISchemaNode.NumberNode numberNode -> JsonNumberSchema.builder().description(numberNode.description()).build();
            case ISchemaNode.BoolNode boolNode -> JsonBooleanSchema.builder().description(boolNode.description()).build();
        };
    }

    /**
     * 字符串元素: 枚举形态优先, 否则自由文本 — 与属性位同一判据.
     */
    private static @NotNull JsonSchemaElement stringElement(@NotNull ISchemaNode.StringNode node)
    {
        if(node.enumValues().isEmpty())
            return JsonStringSchema.builder().description(node.description()).build();
        return JsonEnumSchema.builder().enumValues(node.enumValues()).description(node.description()).build();
    }

    //endregion

    //region 执行器 (query 唯一执行体 + fail-open 兜底)

    /**
     * 视图 → 执行器: 闭包捕获扩展与 mapper, 每次调用独立走 {@link #execute}.
     */
    private @NotNull ToolExecutor executor(@NotNull IDataExtension extension)
    {
        return (ToolExecutionRequest request, Object memoryId) -> execute(extension, request, memoryId);
    }

    /**
     * 执行体: JSON args 反序列化 → memoryId 解析为 userId → query → 结果序列化为文本.
     * <p>任何环节失败 (坏 JSON / 非 UUID memoryId / 实现方抛错 / 序列化失败) 统一降级为
     * {@link #FALLBACK_TEXT} — 兜底缝绝不外抛, WARN 留痕供运维定位.</p>
     */
    private @NotNull String execute(@NotNull IDataExtension extension, @NotNull ToolExecutionRequest request, @Nullable Object memoryId)
    {
        try
        {
            final var args = mapper.readValue(request.arguments(), extension.argsType());
            final var userId = UUID.fromString((String) memoryId);
            return mapper.writeValueAsString(extension.query(userId, args));
        }
        catch(final Exception e)
        {
            LOG.warn(PrintUtils.quickFormat("扩展 \"{}\" 工具调用降级 (command={}, memoryId={})",
                extension.name(), request.name(), memoryId), e);
            return FALLBACK_TEXT;
        }
    }

    //endregion

    /**
     * CDI 供应器: {@code @RegisterAiService(toolProviderSupplier = ...)} 的接线点 —
     * 构造期即注入 {@link ExtensionToolProvider} bean, {@code get()} 直接返回.
     * <p>刻意弃用 {@code CDI.current()} 编程式 lookup: 本 bean 是适配器唯一的静态消费证据来源,
     * 仅靠运行时 lookup 时, quarkus-arc remove-unused-beans 的存活判定 (评审确认 3.36 仍默认激活)
     * 会随升级翻转 — Agent bean 创建期抛 UnsatisfiedResolutionException, 对话首用即崩;
     * 显式注入点令存活成为构建期可证的一等事实.</p>
     * <p>quarkus-langchain4j 以 CDI 注入方式消费本 supplier (见其部署期 addInjectionPoint),
     * 故本类须保持可被容器实例化 (隐式公共无参构造), 不可私有化构造器.</p>
     */
    @ApplicationScoped
    public static final class CDISupplier implements Supplier<ToolProvider>
    {
        //* 注入点即存活证明: 挡住 unused-bean 剪除, 免运行时 select 的解析脆弱性.
        @Inject
        private @NotNull ExtensionToolProvider provider;

        @Override
        public @NotNull ToolProvider get() { return provider; }
    }
}
