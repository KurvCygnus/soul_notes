package kurvcygnus.soulnotes.domain.chat.entity;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import kurvcygnus.soulnotes.config.ReactiveJsonStringJdbcType;
import kurvcygnus.soulnotes.utils.JsonUtils;
import org.hibernate.annotations.JdbcType;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link AiChatSession} 的单元测试</b>
 * <p>验证消息添加、截断等基础操作的正确性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class AiChatSessionTest
{
    @BeforeAll
    @SuppressWarnings("InstantiationOfUtilityClass")//! JsonUtils 为 final 全静态成员类, IDE 误报实例化; 构造器正是 CDI 桥接注入入口.
    static void initMapper()
    {
        //* 纯单元测试无 CDI 容器, 手动构造与生产等价的 mapper (含 JavaTimeModule).
        new JsonUtils(new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    @Test
    void newSession_ShouldHaveEmptyMessages()
    {
        final var session = new AiChatSession();
        session.id = UUID.randomUUID();
        session.userId = UUID.randomUUID();
        session.messages = "[]";

        //* 不显式赋值, 同时验证 warningTriggered 的默认状态.
        assertEquals("[]", session.messages);
        assertFalse(session.warningTriggered);
    }

    @Test
    void addMessage_ShouldAppendToMessages()
    {
        final var session = createTestSession();
        session.addMessage("user", "你好");

        assertNotNull(session.messages);
        assertTrue(session.messages.contains("你好"));
        assertTrue(session.messages.contains("user"));
    }

    @Test
    void addMessage_MultipleMessages_ShouldAccumulate()
    {
        final var session = createTestSession();
        session.addMessage("user", "第一条消息");
        session.addMessage("assistant", "回复");
        session.addMessage("user", "第二条消息");

        //* 通过 JsonUtils 解析 JSON 数组, 验证消息数量正确.
        final var messages = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {});
        assertEquals(3, messages.size());
    }

    //* @since 1.5.0 新消息必须携带 ts (ISO-8601); 旧数据无 ts 由读取端容错.
    @Test
    void addMessage_ShouldStampIsoInstant()
    {
        final var s = new AiChatSession();
        s.messages = "[]";
        s.addMessage("user", "你好");
        assertTrue(s.messages.contains("\"ts\""));
        final var list = JsonUtils.parseJson(s.messages, new TypeReference<List<Map<String, String>>>() {});
        assertDoesNotThrow(() -> Instant.parse(list.getFirst().get("ts")));
    }

    @Test
    void truncate_WithMoreThanMax_ShouldTrimToRecent()
    {
        final var session = createTestSession();
        session.addMessage("user", "msg1");
        session.addMessage("assistant", "reply1");
        session.addMessage("user", "msg2");
        session.addMessage("assistant", "reply2");
        session.addMessage("user", "msg3");

        session.truncate(3);

        final var messages = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {});
        assertEquals(3, messages.size());
    }

    @Test
    void truncate_WithLessThanMax_ShouldNotChange()
    {
        final var session = createTestSession();
        session.addMessage("user", "msg1");
        session.addMessage("assistant", "reply1");

        session.truncate(10);

        final var messages = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {});
        assertEquals(2, messages.size());
    }

    @Test
    void messages_ShouldBeValidJson()
    {
        final var session = createTestSession();
        session.addMessage("user", "{\"nested\": \"value\"}");

        //* messages 字段应为合法 JSON 数组.
        assertTrue(session.messages.startsWith("["));
        assertTrue(session.messages.endsWith("]"));
    }

    @Test
    void messages_Field_ShouldDeclareJsonJdbcType() throws NoSuchFieldException
    {
        //* 声明字符串型 JSONB 映射后, 新写入为真 JSON (jsonb_typeof = array), 存量字符串标量行读出仍可解析;
        //* 缺失时 Hibernate Reactive 把 JSON 文本再包一层, 存成字符串标量 (jsonb_typeof = string) 的双重编码形态.
        final var field = AiChatSession.class.getDeclaredField("messages");
        final var jdbcType = field.getAnnotation(JdbcType.class);

        assertNotNull(jdbcType, "messages 字段缺少 @JdbcType 声明");
        assertEquals(ReactiveJsonStringJdbcType.class, jdbcType.value());
    }

    //region 候选追问 (followups) 附加与读取
    //* @since 1.8.0 追问挂靠最近一条 assistant 消息: 键值为 JSON 数组整体编码的"文本"而非数组值 —
    //! 全部既有读取端以 List<Map<String, String>> 反序列化, 数组值会让该解析直接失败 (二轮对话即 500).
    @Test
    void attachFollowupsToLastAssistant_ShouldWriteEncodedStringOnLastAssistantEntry()
    {
        final var session = createTestSession();
        session.addMessage("user", "睡不着");
        session.addMessage("assistant", "我在听。");
        session.addMessage("user", "谢谢");

        assertTrue(session.attachFollowupsToLastAssistant(List.of("甲", "乙", "丙")), "存在 assistant 消息时必须完成追加");

        final var messages = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {});
        assertEquals(3, messages.size(), "追加不得增删消息条目");
        final var assistantEntry = messages.get(1);
        assertEquals(JsonUtils.toJson(List.of("甲", "乙", "丙")), assistantEntry.get("followups"), "followups 键必须为 JSON 数组编码文本");
        assertFalse(messages.get(2).containsKey("followups"), "后置 user 消息不得被写入追问");
        assertEquals(List.of("甲", "乙", "丙"), AiChatSession.followupsOf(assistantEntry), "读取端应还原为字符串列表");
    }

    @Test
    void attachFollowupsToLastAssistant_WithoutAssistantEntry_ShouldSkip()
    {
        final var session = createTestSession();
        session.addMessage("user", "只有用户消息");

        assertFalse(session.attachFollowupsToLastAssistant(List.of("甲", "乙", "丙")), "无 assistant 消息时应返回 false (调用方跳过落库)");
        assertFalse(session.messages.contains("followups"), "跳过时不得写入 followups 键");
        assertEquals(1, JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {}).size(), "跳过时不得增删消息条目");
    }

    @Test
    void followupsOf_ShouldTolerateMissingBlankAndCorruptedKeys()
    {
        final var session = createTestSession();
        session.addMessage("user", "存量消息");
        final var legacyEntry = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {}).getFirst();

        assertTrue(AiChatSession.followupsOf(legacyEntry).isEmpty(), "存量无 followups 键应读为空列表");
        assertTrue(AiChatSession.followupsOf(null).isEmpty(), "null 条目应读为空列表");

        final var corrupted = new java.util.HashMap<String, String>();
        corrupted.put("followups", "{broken");
        assertTrue(AiChatSession.followupsOf(corrupted).isEmpty(), "损坏键应读为空列表 (历史回放不得失败)");
    }
    //endregion

    private static AiChatSession createTestSession()
    {
        final var session = new AiChatSession();
        session.id = UUID.randomUUID();
        session.userId = UUID.randomUUID();
        session.messages = "[]";
        return session;
    }
}