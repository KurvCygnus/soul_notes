package kurvcygnus.soulnotes.domain.chat.dto;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.time.Instant;

/**
 * 单条聊天消息 VO, 用于向前端回放对话内容.
 *
 * @param role      角色: "user" / "assistant"
 * @param content   消息正文 (已剥离结构化契约块)
 * @param timestamp 消息时间戳 (服务端生成)
 * @param sessionId 实际写入的会话 ID (非流式 send 专属): 新建会话回传新 id, 续聊原样回带 —
 *                  与流式路径流首 meta 事件对齐, 前端降级路径据此绑定会话 (走查 fast-follow 补齐)
 * @since 1.0
 */
public record ChatMessageVo(
    @NotNull String  role,
    @NotNull String  content,
    @NotNull Instant timestamp,
    @Nullable String sessionId
) {}