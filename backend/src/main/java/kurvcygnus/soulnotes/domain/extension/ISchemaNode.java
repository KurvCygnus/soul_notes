package kurvcygnus.soulnotes.domain.extension;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 工具参数 schema 节点 (spec D3): JSON Schema 的够用子集, 以只读密封类树表达 —
 * 第三方经 {@link Schema#builder()} 流式构造, 构造面唯一 (Builder-only 裁决);
 * 本类型不泄漏任何 LLM 框架类型, 框架侧 (ExtensionToolProvider) 自行适配为工具规格.
 *
 * @implNote 树整体不可变 (record + 不可变集合), 启动期结构校验 (spec D4) 依赖该前提.
 * @since 1.7.0
 */
public sealed interface ISchemaNode
{
    /**
     * 对象节点: 具名属性集 + 必填集.
     *
     * @param properties  属性名 → 子节点 (保持插入序)
     * @param required    必填属性名集 (必须是 properties 的子集 — Builder 构造期已校验)
     * @param description 节点说明 (LLM 逐字段可读), 可为 null
     */
    record ObjectNode(
        @NotNull Map<String, ISchemaNode> properties,
        @NotNull Set<String> required,
        @Nullable String description
    ) implements ISchemaNode
    {
        public ObjectNode
        {
            properties = Map.copyOf(properties);
            required = Set.copyOf(required);
        }
    }

    /**
     * 数组节点: 单一 items 形态.
     *
     * @param items       元素节点
     * @param description 节点说明, 可为 null
     */
    record ArrayNode(
        @NotNull ISchemaNode items,
        @Nullable String description
    ) implements ISchemaNode {}

    /**
     * 字符串节点: 自由文本或枚举.
     *
     * @param description 节点说明, 可为 null
     * @param enumValues  枚举值全集; 空表 = 自由文本
     */
    record StringNode(
        @Nullable String description,
        @NotNull List<String> enumValues
    ) implements ISchemaNode
    {
        public StringNode { enumValues = List.copyOf(enumValues); }
    }

    /** 数值节点. @param description 节点说明, 可为 null */
    record NumberNode(@Nullable String description) implements ISchemaNode {}

    /** 整数节点. @param description 节点说明, 可为 null */
    record IntegerNode(@Nullable String description) implements ISchemaNode {}

    /** 布尔节点. @param description 节点说明, 可为 null */
    record BoolNode(@Nullable String description) implements ISchemaNode {}
}
