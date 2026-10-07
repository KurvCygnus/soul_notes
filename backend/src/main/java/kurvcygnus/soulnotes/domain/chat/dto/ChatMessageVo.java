package kurvcygnus.soulnotes.domain.chat.dto;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.time.Instant;
import java.util.List;

/**
 * 单条聊天消息 VO, 用于向前端回放对话内容.
 *
 * @param role      角色: "user" / "assistant"
 * @param content   消息正文 (已剥离结构化契约块)
 * @param timestamp 消息时间戳 (服务端生成)
 * @param sessionId 实际写入的会话 ID (非流式 send 专属): 新建会话回传新 id, 续聊原样回带 —
 *                  与流式路径流首 meta 事件对齐, 前端降级路径据此绑定会话 (走查 fast-follow 补齐)
 * @param followups 候选追问; 非流式 send 响应恒为空数组 (追问在回复落库后异步生成,
 *                  经 SSE 流尾随事件与历史回放到达, 该字段仅为与 {@link ChatHistoryMessage} 形状对齐)
 * @since 1.0
 */
public record ChatMessageVo(
    @NotNull String  role,
    @NotNull String  content,
    @NotNull Instant timestamp,
    @Nullable String sessionId,
    @NotNull List<String> followups
) {}
