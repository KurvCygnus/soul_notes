package kurvcygnus.soulnotes.domain.chat.dto;

import kurvcygnus.soulnotes.domain.chat.entity.UserChatStyle;
import org.jetbrains.annotations.NotNull;

/**
 * 聊天风格五轴读取 VO.
 *
 * @param style      表达基调 (七值)
 * @param warmth     温暖程度 (三值)
 * @param enthusiasm 热情程度 (三值)
 * @param headings   标题组织 (三值)
 * @param emoji      表情使用 (三值)
 * @implNote 无行用户由 {@link #defaults()} 返回五轴全 default: 缺省语义收口在 VO 层,
 *           不做懒建行 (只读不写的用户不产生垃圾行).
 * @since 2.1.0
 */
public record ChatStyleVo(
    String style,
    String warmth,
    String enthusiasm,
    String headings,
    String emoji
) {
    /**
     * 五轴全 default 的缺省形态 (无行用户的读取语义).
     *
     * @return 全 default VO
     */
    public static @NotNull ChatStyleVo defaults() { return new ChatStyleVo("default", "default", "default", "default", "default"); }

    /**
     * 从实体行构造 VO.
     *
     * @param entity 聊天风格行
     * @return 五轴透传 VO
     */
    public static @NotNull ChatStyleVo of(@NotNull UserChatStyle entity)
    {
        return new ChatStyleVo(entity.style, entity.warmth, entity.enthusiasm, entity.headings, entity.emoji);
    }
}
