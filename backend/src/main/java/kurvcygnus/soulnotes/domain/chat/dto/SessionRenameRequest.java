package kurvcygnus.soulnotes.domain.chat.dto;

import org.jetbrains.annotations.NotNull;

/**
 * 会话重命名请求体.
 *
 * @param title 新标题 (服务端剥离首尾空白后校验: 非空且不超 100 字)
 * @since 1.9.0
 */
public record SessionRenameRequest(
    @NotNull String title
) {}
