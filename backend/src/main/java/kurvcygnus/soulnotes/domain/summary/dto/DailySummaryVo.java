package kurvcygnus.soulnotes.domain.summary.dto;

import org.jetbrains.annotations.NotNull;

import java.time.LocalDate;

/**
 * 每日总结 VO: 前端"每日絮语"卡的展示载荷.
 *
 * @param date    业务时区自然日
 * @param content 总结留言正文 (一句总结 + 行动建议合并文本, 落库前已 200 字封顶)
 * @since 1.5.0
 */
public record DailySummaryVo(
    @NotNull LocalDate date,
    @NotNull String    content
) {}
