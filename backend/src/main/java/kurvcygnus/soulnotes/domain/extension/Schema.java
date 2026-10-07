package kurvcygnus.soulnotes.domain.extension;

import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode.ArrayNode;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode.BoolNode;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode.IntegerNode;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode.NumberNode;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode.ObjectNode;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode.StringNode;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * 参数 schema 唯一构造入口 (spec D3 "Schema 创建对外仅暴露 Builder"): 流式 DSL 产出 {@link ObjectNode} 根.
 * <p>用法:
 * <pre>{@code
 * ISchemaNode root = Schema.builder()
 *     .description("查询学生安排")
 *     .stringProperty("date", "查询日期, 格式 2026-10-03")
 *     .objectProperty("range", b -> b.integerProperty("days").required("days"))
 *     .required("date")
 *     .build();
 * }</pre></p>
 *
 * @implNote 构造期即校验 required ⊆ properties (fail-fast, 对齐启动校验 D4 的结构不变式);
 *           标量便捷方法的 description 允许 null (LLM 侧缺省说明).
 * @since 1.7.0
 */
public final class Schema
{
    private Schema() { throw new IllegalAccessError("Class \"Schema\" is not meant to be instantized!"); }

    /**
     * 开启根对象构造.
     *
     * @return 根对象 builder
     */
    public static @NotNull ObjectBuilder builder() { return new ObjectBuilder(); }

    /**
     * 对象节点 builder: 具名属性 + 必填集 + 说明.
     */
    public static final class ObjectBuilder
    {
        private final @NotNull Map<String, ISchemaNode> properties = new LinkedHashMap<>();
        private final @NotNull Set<String> required = new LinkedHashSet<>();
        private @Nullable String description;

        /**
         * 节点说明 (LLM 逐字段可读).
         *
         * @param description 说明文本
         * @return self
         */
        public @NotNull ObjectBuilder description(@NotNull String description)
        {
            this.description = description;
            return this;
        }

        /**
         * 字符串属性.
         */
        public @NotNull ObjectBuilder stringProperty(@NotNull String name, @Nullable String description)
        {
            return property(name, new StringNode(description, List.of()));
        }

        /**
         * 枚举字符串属性.
         */
        public @NotNull ObjectBuilder stringEnumProperty(@NotNull String name, @Nullable String description, @NotNull List<String> values)
        {
            return property(name, new StringNode(description, values));
        }

        /**
         * 整数属性.
         */
        public @NotNull ObjectBuilder integerProperty(@NotNull String name, @Nullable String description)
        {
            return property(name, new IntegerNode(description));
        }

        /**
         * 数值属性.
         */
        public @NotNull ObjectBuilder numberProperty(@NotNull String name, @Nullable String description)
        {
            return property(name, new NumberNode(description));
        }

        /**
         * 布尔属性.
         */
        public @NotNull ObjectBuilder boolProperty(@NotNull String name, @Nullable String description)
        {
            return property(name, new BoolNode(description));
        }

        /**
         * 嵌套对象属性.
         */
        public @NotNull ObjectBuilder objectProperty(@NotNull String name, @NotNull Consumer<ObjectBuilder> nested)
        {
            final var nestedBuilder = new ObjectBuilder();
            nested.accept(nestedBuilder);
            return property(name, nestedBuilder.build());
        }

        /**
         * 字符串数组属性.
         */
        public @NotNull ObjectBuilder arrayOfStringsProperty(@NotNull String name, @Nullable String description)
        {
            return property(name, new ArrayNode(new StringNode(null, List.of()), description));
        }

        /**
         * 对象数组属性: items 为单一对象形态, 经嵌套 builder 构造 —
         * 复杂对象数组的 DSL 一等公民化, 免第三方被迫裸 new record 绕过构造门.
         */
        public @NotNull ObjectBuilder arrayProperty(@NotNull String name, @Nullable String description, @NotNull Consumer<ObjectBuilder> items)
        {
            final var itemBuilder = new ObjectBuilder();
            items.accept(itemBuilder);
            return property(name, new ArrayNode(itemBuilder.build(), description));
        }

        /**
         * 直挂既有节点 (自定义组合).
         */
        public @NotNull ObjectBuilder property(@NotNull String name, @NotNull ISchemaNode node)
        {
            properties.put(name, node);
            return this;
        }

        /**
         * 声明必填属性集.
         */
        public @NotNull ObjectBuilder required(@NotNull String... names)
        {
            required.addAll(List.of(names));
            return this;
        }

        /**
         * 终结构造: 校验 required ⊆ properties 后产出只读对象节点.
         *
         * @return 对象节点
         * @throws IllegalStateException required 引用了未注册属性 — 契约写错, 构造期快速失败
         */
        public @NotNull ISchemaNode build()
        {
            for(final var name: required)
                if(!properties.containsKey(name))
                    throw new IllegalStateException(PrintUtils.quickFormat("required 属性 \"{}\" 未注册 (Builder-only 契约校验)", name));
            return new ObjectNode(properties, required, description);
        }
    }
}
