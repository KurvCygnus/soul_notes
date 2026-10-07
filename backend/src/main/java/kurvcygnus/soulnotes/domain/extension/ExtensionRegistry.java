package kurvcygnus.soulnotes.domain.extension;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import kurvcygnus.soulnotes.utils.PrintUtils;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 数据扩展注册表 (spec §5): CDI 构建期收集全部 {@link IDataExtension} bean (D1), 构造期完成
 * 全部启动校验 (D4) — 命名/命令格式与唯一性、描述非空、schema 结构不变式、参数树与 argsType 对齐;
 * 任一违例经 {@link ExtensionException} 拒绝启动 (扩展体系唯一硬失败点).
 *
 * @implNote 校验清单与错误文案点名违例扩展, 运维可直接定位; argsType 属性集经 Jackson introspection
 *           求取 (record/bean 一体适用); schema 结构不变式含逐层 {@code required ⊆ properties} 树校验 —
 *           Builder 单点把关外的注册表防线 (嵌套 record public 可直接构造, 单点把关可被绕过).
 *           对外只读: {@code all()/byName()/tools()}.
 * @since 1.7.0
 */
@SuppressWarnings("rawtypes")//! 注册表天然持异构扩展 (D/A 逐扩展不同): 裸 IDataExtension 即准确形态, 通配符反引入无谓转换.
@ApplicationScoped
public final class ExtensionRegistry
{
    //* 扩展 ID: REST 路径段, 小写字母开头 + 小写字母/数字/连字符.
    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z][a-z0-9-]*$");
    //* 工具命令名: LLM 调用动作名, 字母/数字/下划线/连字符.
    private static final Pattern COMMAND_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]+$");

    private final @NotNull List<IDataExtension<?, ?>> extensions;
    private final @NotNull Map<String, IDataExtension<?, ?>> byName;
    private final @NotNull List<ToolView> tools;

    /** 工具视图: 扩展与其 LLM 契约描述的配对 (ExtensionToolProvider 合成规格的输入). */
    public record ToolView(@NotNull IDataExtension<?, ?> extension, @NotNull LLMToolSpec spec) {}

    public ExtensionRegistry(@NotNull Instance<IDataExtension<?, ?>> beans, @NotNull ObjectMapper mapper)
    {
        final var collected = new ArrayList<IDataExtension<?, ?>>();
        for(final var bean: beans)
            collected.add(bean);
        final var byNameIndex = new LinkedHashMap<String, IDataExtension<?, ?>>();
        final var commandIndex = new LinkedHashMap<String, ToolView>();
        final var toolsCollected = new ArrayList<ToolView>();

        for(final var extension: collected)
        {
            final var name = extension.name();
            if(!NAME_PATTERN.matcher(name).matches())
                throw new ExtensionException(PrintUtils.quickFormat("扩展名 \"{}\" 不符合格式 ^[a-z][a-z0-9-]*$", name));
            if(byNameIndex.containsKey(name))
                throw new ExtensionException(PrintUtils.quickFormat("扩展名 \"{}\" 重复注册", name));
            byNameIndex.put(name, extension);

            final var spec = extension.aiCallCommand();
            if(spec == null)
                continue;
            if(!COMMAND_PATTERN.matcher(spec.command()).matches())
                throw new ExtensionException(PrintUtils.quickFormat("扩展 \"{}\" 的工具命令 \"{}\" 不符合格式 ^[a-zA-Z0-9_-]+$", name, spec.command()));
            if(commandIndex.containsKey(spec.command()))
                throw new ExtensionException(PrintUtils.quickFormat("工具命令 \"{}\" 重复 (扩展 \"{}\" 与 \"{}\")", spec.command(), commandIndex.get(spec.command()).extension().name(), name));
            if(spec.description().isBlank())
                throw new ExtensionException(PrintUtils.quickFormat("扩展 \"{}\" 的工具说明不得为空白", name));
            validateSchemaAgainstArgsType(mapper, name, extension.argsType(), spec.parameters());
            validateSchemaTree(name, spec.parameters());

            final var view = new ToolView(extension, spec);
            commandIndex.put(spec.command(), view);
            toolsCollected.add(view);
        }

        this.extensions = List.copyOf(collected);
        this.byName = Map.copyOf(byNameIndex);
        this.tools = List.copyOf(toolsCollected);
    }

    /**
     * 全部注册扩展 (文件序 = 向导/REST 枚举序).
     */
    public @NotNull List<IDataExtension<?, ?>> all() { return extensions; }

    /**
     * 按 ID 查扩展.
     *
     * @throws ExtensionException 未知 ID
     */
    public @NotNull IDataExtension<?, ?> byName(@NotNull String name)
    {
        final var extension = byName.get(name);
        if(extension == null)
            throw new ExtensionException(PrintUtils.quickFormat("未知数据扩展 \"{}\"", name));
        return extension;
    }

    /**
     * 暴露给 LLM 的工具视图 (仅含声明了 {@code aiCallCommand()} 的扩展, 声明序).
     */
    public @NotNull List<ToolView> tools() { return tools; }

    //* 一致性校验 (D4): 参数树顶层属性必须都能被 argsType 承接 — LLM 按树填参, 反序列化按类承接,
    //! 两契约漂移即 "LLM 填了字段但静默丢失", 必须挡在部署前. Jackson introspection 对 record/bean 一体适用.
    private static void validateSchemaAgainstArgsType(
        @NotNull ObjectMapper mapper,
        @NotNull String extensionName,
        @NotNull Class<?> argsType,
        @NotNull ISchemaNode parameters
    )
    {
        if(!(parameters instanceof ISchemaNode.ObjectNode objectNode))
            return;  //* 根非对象 (如空查询占位) 无属性对齐问题.
        final var beanProperties = mapper.getSerializationConfig().
            introspect(mapper.constructType(argsType)).
            findProperties().
            stream().
            map(p -> p.getName()).
            toList();
        for(final var property: objectNode.properties().keySet())
            if(!beanProperties.contains(property))
                throw new ExtensionException(PrintUtils.quickFormat(
                    "扩展 \"{}\" 的参数树属性 \"{}\" 不在 argsType {} 的可序列化属性集内 (契约漂移)",
                    extensionName, property, argsType.getSimpleName()));
    }

    //* 树级结构校验 (D4): 逐层断言 ObjectNode 的 required ⊆ 同层已注册属性, 并递归子节点 (ArrayNode.items 亦递归可达).
    //! Builder 虽在 build() 单点把关, 但 ISchemaNode 嵌套 record 是 public 可直接构造, 且 langchain4j
    //! JsonObjectSchema.Builder 对 required 不做子集校验 — 违例树会静默产出非法 JSON Schema 发给 LLM,
    //! 故注册表必须在启动期递归补上这道防线.
    private static void validateSchemaTree(@NotNull String extensionName, @NotNull ISchemaNode node)
    {
        if(node instanceof ISchemaNode.ObjectNode objectNode)
        {
            for(final var name: objectNode.required())
                if(!objectNode.properties().containsKey(name))
                    throw new ExtensionException(PrintUtils.quickFormat(
                        "扩展 \"{}\" 的参数树必填属性 \"{}\" 未在该层注册 (required ⊆ properties 违例)",
                        extensionName, name));
            for(final var child: objectNode.properties().values())
                validateSchemaTree(extensionName, child);
            return;
        }
        if(node instanceof ISchemaNode.ArrayNode arrayNode)
            validateSchemaTree(extensionName, arrayNode.items());
    }
}
