package kurvcygnus.soulnotes.domain.chat.dto;

/**
 * 聊天风格五轴写入请求体.
 *
 * @param style      表达基调 (七值: default/professional/friendly/direct/optimist/pragmatic/witty)
 * @param warmth     温暖程度 (三值: less/default/more)
 * @param enthusiasm 热情程度 (三值)
 * @param headings   标题组织 (三值)
 * @param emoji      表情使用 (三值)
 * @implNote 缺字段反序列化为 null: 白名单校验把 null 与空白一并拒绝为 400, 服务端不做默认值兜底 —
 *           偏好更新是全量 PUT, 前端必须回传完整五轴, 部分更新语义不成立.
 * @since 2.1.0
 */
public record ChatStyleRequest(
    String style,
    String warmth,
    String enthusiasm,
    String headings,
    String emoji
) {}
