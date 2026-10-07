package kurvcygnus.soulnotes.domain.extension.dto;

import org.jetbrains.annotations.Nullable;

/**
 * 扩展通知开关请求体: {@code PUT /api/v1/ext/{name}/notify} 负载 (P3 Task 1).
 *
 * @param enabled 是否启用该扩展的通知; {@code null} = 字段缺席/JSON null (资源层 400 形态拒绝,
 *                不做缺省推断 — 开关是显式用户意图, 静默兜底会放大误触达)
 * @since 2.2.0
 */
public record ExtensionNotifyRequest(@Nullable Boolean enabled) {}
