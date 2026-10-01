package kurvcygnus.soulnotes.domain.chat.dto;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.time.Instant;
import java.util.UUID;

/**
 * 会话概览 VO, 用于会话列表展示, 不包含完整消息内容.
 *
 * @param sessionId      会话 ID
 * @param messageCount   消息总数
 * @param lastUpdateTime 最后更新时间
 * @param title          会话标题 (首轮交换后 AI 生成); 存量会话为 {@code null}, 前端以预览兜底展示
 * @param preview        最近一条消息的预览 (超 50 字截断, 无内容时为空串, 恒非 null)
 * @since 1.0
 */
public record ChatSessionVo(
    @NotNull UUID    sessionId,
    int              messageCount,
    @NotNull Instant lastUpdateTime,
    @Nullable String title,
    @NotNull String  preview
) {}
