package kurvcygnus.soulnotes.domain.extension;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link Schema} Builder-only 构造契约测试</b> (spec D3/D4).
 *
 * @author Claude Code
 * @since 1.7.0
 */
class SchemaTest
{
    @Test void builder_ShouldComposeNestedAndEnumNodes()
    {
        final var root = Schema.builder().
            description("查询学生安排").
            stringProperty("date", "查询日期, 格式 2026-10-03").
            stringEnumProperty("kind", "查询种类", List.of("today", "week")).
            integerProperty("limit", "条数上限").
            objectProperty("range", b -> b.integerProperty("days", "展望天数").required("days")).
            arrayOfStringsProperty("tags", "标签").
            required("date").
            build();

        assertInstanceOf(ISchemaNode.ObjectNode.class, root);
        final var objectNode = (ISchemaNode.ObjectNode) root;
        assertEquals(5, objectNode.properties().size());
        assertEquals(Set.of("date"), objectNode.required());
        assertInstanceOf(ISchemaNode.IntegerNode.class, objectNode.properties().get("limit"));
        final var kind = (ISchemaNode.StringNode) objectNode.properties().get("kind");
        assertEquals(List.of("today", "week"), kind.enumValues());
        final var range = (ISchemaNode.ObjectNode) objectNode.properties().get("range");
        assertEquals(Set.of("days"), range.required());
    }

    //* arrayProperty 便捷方法 (终审修复): 对象数组形态的 DSL 一等公民化 — 消除第三方组复杂数组时被推向裸 new record 的推力.
    @Test void arrayProperty_ShouldComposeObjectItemsNode()
    {
        final var root = Schema.builder().
            arrayProperty("exams", "考试列表", items -> items.
                stringProperty("name", "课程名").
                integerProperty("days", "倒计时天数").
                required("name", "days")).
            build();

        assertInstanceOf(ISchemaNode.ObjectNode.class, root);
        final var properties = ((ISchemaNode.ObjectNode) root).properties();
        final var array = (ISchemaNode.ArrayNode) properties.get("exams");
        assertEquals("考试列表", array.description());
        assertInstanceOf(ISchemaNode.ObjectNode.class, array.items());
        final var items = (ISchemaNode.ObjectNode) array.items();
        assertEquals(Set.of("name", "days"), items.required());
        assertInstanceOf(ISchemaNode.IntegerNode.class, items.properties().get("days"));
    }

    @Test void build_ShouldFailFast_WhenRequiredPropertyNotRegistered()
    {
        final var builder = Schema.builder().required("ghost");
        assertThrows(IllegalStateException.class, builder::build, "required 引用未注册属性必须构造期快速失败");
    }

    @Test void nodes_ShouldBeImmutable()
    {
        final var node = new ISchemaNode.ObjectNode(
            java.util.Map.of("a", new ISchemaNode.IntegerNode(null)),
            java.util.Set.of("a"), null);
        assertThrows(UnsupportedOperationException.class, () -> node.properties().clear());
        assertThrows(UnsupportedOperationException.class, () -> node.required().clear());
    }
}
