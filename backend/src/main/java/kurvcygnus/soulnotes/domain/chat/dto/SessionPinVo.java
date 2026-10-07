package kurvcygnus.soulnotes.domain.chat.dto;

import org.jetbrains.annotations.Nullable;

import java.time.Instant;

/**
 * 会话置顶翻转结果 VO.
 *
 * @param pinnedAt 翻转后的置顶时刻; {@code null} = 已取消置顶 — 项目未启用 NON_NULL 序列化,
 *                 null 以 {@code "pinnedAt": null} 在场 (前端已按 null/缺席双形态归一);
 *                 前端一律以本响应为准落定状态, 不自行推断
 * @since 1.9.0
 */
public record SessionPinVo(@Nullable Instant pinnedAt) {}
