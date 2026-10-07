package kurvcygnus.soulnotes.domain.extension;

import org.jetbrains.annotations.NotNull;

/**
 * 扩展通知规则 (P3 Task 1): {@link IDataExtension#notificationRules} 的单条产物 —
 * 扩展侧自算到期窗口后回报的 "此刻应下发" 通知.
 *
 * @param id           规则稳定 ID (幂等键组成部分, 与 type/date 共同构成当日去重键; 同日同 id 只下发一次)
 * @param type         通知类型标记 (如 {@code class}; 随 WS 负载的 tag 字段透传前端分组)
 * @param title        通知标题 (如 "即将上课")
 * @param bodyTemplate 通知正文; 命名保留模板语义 (SPI 通用性), 但 <b>渲染职责在扩展内</b> —
 *                     内置实现按条目实例化为最终文本, 调度器不做占位符替换, 原样下发
 * @param minutesOffset 触发时刻相对锚点事件的分钟偏移 (负值 = 锚点前 N 分钟, 如课表 "上课前 15 分钟" 为 -15);
 *                      扩展内计算到期的产物元数据, 调度器不消费
 * @since 2.2.0
 */
public record ExtensionNotificationRule(
    @NotNull String id,
    @NotNull String type,
    @NotNull String title,
    @NotNull String bodyTemplate,
    int minutesOffset
) {}
