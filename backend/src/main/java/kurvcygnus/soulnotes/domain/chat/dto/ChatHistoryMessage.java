package kurvcygnus.soulnotes.domain.chat.dto;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * 历史消息条目, 用于按会话回放完整对话 (含 LLM 回复).
 *
 * @param role    角色: "user" / "assistant"
 * @param content 消息正文 (落库时已剥离结构化契约块)
 * @param ts      消息时间戳 (ISO-8601); 存量消息与损坏数据为 null, 前端对 null 不做时间分组
 * @since 1.2.1
 */
public record ChatHistoryMessage(
    @NotNull String role,
    @NotNull String content,
    @Nullable String ts
) {}
