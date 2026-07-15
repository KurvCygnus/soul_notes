package kurvcygnus.soulnotes.domain.chat.dto;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>对话模块 DTO 单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class ChatDtoTest
{
    @Test void chatSendRequest_WithSessionId()
    {
        final var sessionId = UUID.randomUUID();
        final var req = new ChatSendRequest(sessionId, "你好");
        assertEquals(sessionId, req.sessionId());
        assertEquals("你好", req.content());
    }

    @Test void chatSendRequest_WithoutSessionId()
    {
        final var req = new ChatSendRequest(null, "新对话");
        assertNull(req.sessionId());
    }

    //! @NotNull 注解在运行时不进行空值校验, 因此不测试 null 参数构造.

    @Test void chatMessageVo_ShouldStoreFields()
    {
        final var now = Instant.now();
        final var msg = new ChatMessageVo("user", "hello", now);
        assertEquals("user", msg.role());
        assertEquals("hello", msg.content());
        assertEquals(now, msg.timestamp());
    }

    @Test void chatMessageVo_AssistantMessage()
    {
        final var msg = new ChatMessageVo("assistant", "你好！有什么我可以帮助你的吗？", Instant.now());
        assertEquals("assistant", msg.role());
    }

    @Test void chatSessionVo_ShouldStoreFields()
    {
        final var sessionId = UUID.randomUUID();
        final var now = Instant.now();
        final var vo = new ChatSessionVo(sessionId, 5, now, "最近一条消息的预览...");
        assertEquals(sessionId, vo.sessionId());
        assertEquals(5, vo.messageCount());
        assertEquals(now, vo.lastUpdateTime());
        assertEquals("最近一条消息的预览...", vo.preview());
    }
}