package kurvcygnus.soulnotes.domain.extension;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.inject.Instance;
import org.junit.jupiter.api.Test;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ExtensionRegistry} 收集与启动校验测试</b> (spec D4): 命名/命令格式与唯一性、描述非空、
 * schema 顶层属性 ⊆ argsType Jackson 属性集 — 任一违例拒绝启动.
 *
 * @author Claude Code
 * @since 1.7.0
 */
class ExtensionRegistryTest
{
    //* 空参数标记 (Task 4 的 NoArgs 同形; 测试域独立声明免主代码依赖).
    record NoArgs() {}

    //* 合法示例扩展: 无参查询 + 工具契约.
    static final class GoodExtension implements IDataExtension<List<String>, NoArgs>
    {
        @Override public String name() { return "good-ext"; }
        @Override public Class<NoArgs> argsType() { return NoArgs.class; }
        @Override public List<String> query(UUID userId, NoArgs args) { return List.of("数据"); }
        @Override public LLMToolSpec aiCallCommand()
        {
            return new LLMToolSpec("query_good", "查询演示数据", Schema.builder().build());
        }
    }

    //* 坏扩展示例工厂: 按需覆写违例面.
    static IDataExtension<?, ?> extension(String name, String command, String description, ISchemaNode parameters)
    {
        return new IDataExtension<List<String>, NoArgs>()
        {
            @Override public String name() { return name; }
            @Override public Class<NoArgs> argsType() { return NoArgs.class; }
            @Override public List<String> query(UUID userId, NoArgs args) { return List.of(); }
            @Override public LLMToolSpec aiCallCommand() { return new LLMToolSpec(command, description, parameters); }
        };
    }

    //* 树校验样例参数: 顶层属性名与 argsType Jackson 属性集对齐 — 保证违例只能由树校验 (required ⊆ properties) 捕获, 归因精确.
    record TreeArgs(Integer range, List<String> tags) {}

    //* 树校验样例扩展: 参数树由构造注入 (违例树直接 new record, 绕过 Builder 单点把关的正面入口).
    static final class TreeExtension implements IDataExtension<List<String>, TreeArgs>
    {
        private final ISchemaNode parameters;

        TreeExtension(ISchemaNode parameters) { this.parameters = parameters; }

        @Override public String name() { return "tree-ext"; }
        @Override public Class<TreeArgs> argsType() { return TreeArgs.class; }
        @Override public List<String> query(UUID userId, TreeArgs args) { return List.of(); }
        @Override public LLMToolSpec aiCallCommand()
        {
            return new LLMToolSpec("query_tree", "树校验样例扩展", parameters);
        }
    }

    private ExtensionRegistry registry(Instance<IDataExtension<?, ?>> beans) { return new ExtensionRegistry(beans, new ObjectMapper()); }

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

    @Test void collect_ShouldExposeAllAndByName()
    {
        final var registry = registry(fake(new GoodExtension()));
        assertEquals(1, registry.all().size());
        assertEquals("good-ext", registry.byName("good-ext").name());
    }

    @Test void collect_ShouldRejectDuplicateName()
    {
        assertThrows(ExtensionException.class, () -> registry(fake(new GoodExtension(), new GoodExtension())));
    }

    @Test void collect_ShouldRejectIllegalNameFormat()
    {
        assertThrows(ExtensionException.class, () -> registry(fake(extension("GoodExt", "query_x", "说明", Schema.builder().build()))));
        assertThrows(ExtensionException.class, () -> registry(fake(extension("", "query_x", "说明", Schema.builder().build()))));
    }

    @Test void collect_ShouldRejectDuplicateOrIllegalCommand()
    {
        final var a = extension("ext-a", "query_dup", "说明 A", Schema.builder().build());
        final var b = extension("ext-b", "query_dup", "说明 B", Schema.builder().build());
        assertThrows(ExtensionException.class, () -> registry(fake(a, b)));
        assertThrows(ExtensionException.class, () -> registry(fake(extension("ext-c", "查询中文!", "说明", Schema.builder().build()))));
    }

    @Test void collect_ShouldRejectBlankDescription()
    {
        //* LLMToolSpec 构造期即拒空白说明 (record 紧凑构造器守卫), 到不了注册表校验 — 断言构造期异常形态.
        assertThrows(IllegalArgumentException.class,
            () -> new LLMToolSpec("query_d", "  ", Schema.builder().build()));
    }

    @Test void collect_ShouldRejectSchemaPropertyOutsideArgsType()
    {
        //* schema 顶层声明了 argsType (NoArgs, 零字段) 上不存在的属性 → 对齐校验失败 (D4).
        final var bad = extension("ext-e", "query_e", "说明",
            Schema.builder().stringProperty("ghost", "不存在的参数").build());
        assertThrows(ExtensionException.class, () -> registry(fake(bad)));
    }

    //* 树级校验 (终审修复): ISchemaNode 嵌套 record 是 public 可直接构造, Builder 的单点把关可被绕过 —
    //! langchain4j JsonObjectSchema.Builder 对 required 不做子集校验, 违例树会静默产出非法 JSON Schema 发给 LLM,
    //! 故注册表必须逐层递归拦截 (含 ArrayNode.items 递归可达).
    @Test void collect_ShouldRejectTreeWithRequiredOutsideProperties()
    {
        //* 顶层违例: required 引用同层未注册属性.
        final var topLevel = new ISchemaNode.ObjectNode(
            Map.of("range", new ISchemaNode.IntegerNode(null)),
            Set.of("range", "ghost"), null);
        assertThrows(ExtensionException.class, () -> registry(fake(new TreeExtension(topLevel))));

        //* 嵌套违例: 顶层对 argsType 完全合法, 违例藏在 ArrayNode.items 的对象层 — 只有递归校验才拦得住.
        final var nested = Schema.builder().
            objectProperty("range", b -> b.integerProperty("days", "展望天数")).
            property("tags", new ISchemaNode.ArrayNode(
                new ISchemaNode.ObjectNode(
                    Map.of("day", new ISchemaNode.IntegerNode(null)),
                    Set.of("day", "ghost"), null),
                "日期数组")).
            build();
        assertThrows(ExtensionException.class, () -> registry(fake(new TreeExtension(nested))));
    }

    @Test void tools_ShouldExposeOnlyExtensionsWithCommand()
    {
        final var restOnly = new IDataExtension<List<String>, NoArgs>()
        {
            @Override public String name() { return "rest-only"; }
            @Override public Class<NoArgs> argsType() { return NoArgs.class; }
            @Override public List<String> query(UUID userId, NoArgs args) { return List.of(); }
            @Override public LLMToolSpec aiCallCommand() { return null; }
        };
        final var registry = registry(fake(restOnly, new GoodExtension()));
        assertEquals(1, registry.tools().size());
        assertEquals("query_good", registry.tools().getFirst().spec().command());
    }

    @Test void byName_ShouldRejectUnknown()
    {
        assertThrows(ExtensionException.class, () -> registry(fake(new GoodExtension())).byName("nope"));
    }
}
