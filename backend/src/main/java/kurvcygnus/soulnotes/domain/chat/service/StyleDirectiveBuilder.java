package kurvcygnus.soulnotes.domain.chat.service;

import kurvcygnus.soulnotes.domain.chat.entity.UserChatStyle;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * 用户聊天风格指令块拼装器 (纯静态, P2 Task 1).
 * <p>将五轴偏好 ({@code style} 七值 + 四三态轴) 拼装为注入共情对话 systemPrompt 的风格块文本;
 * 全 default (含无行) 时返回空串 — {@code ChatService} 以空串判定 "不插风格块", 保证组装结果与
 * 无风格注入的现状逐字节一致.</p>
 *
 * @implNote 值越白名单一律按 default 降级 (与 PUT 白名单校验同源于 {@code UserChatStyle} 常量):
 *           数据库手改/历史遗留值绝不产生越权措辞指令, 失败方向是 "无风格" 而非 "未知风格".
 *           块内行序恒定 (基调 → 温暖 → 热情 → 标题 → 表情), 输出确定性便于测试与审计.
 * @since 2.1.0
 */
public final class StyleDirectiveBuilder
{
    private StyleDirectiveBuilder() { throw new IllegalAccessError("Class \"StyleDirectiveBuilder\" is not meant to be instantized!"); }

    /**
     * 将五轴偏好拼装为风格块文本.
     *
     * @param style 用户风格行; {@code null} (无行) 视为全 default
     * @return 风格块 (首行恒为哨兵句, 行序恒定); 全 default/无行/值越白名单时为空串
     */
    public static @NotNull String build(@Nullable UserChatStyle style)
    {
        if(style == null)
            return "";
        final var styleAxis  = normalize(style.style, UserChatStyle.STYLE_VALUES);
        final var warmth     = normalize(style.warmth, UserChatStyle.TRI_STATE_VALUES);
        final var enthusiasm = normalize(style.enthusiasm, UserChatStyle.TRI_STATE_VALUES);
        final var headings   = normalize(style.headings, UserChatStyle.TRI_STATE_VALUES);
        final var emoji      = normalize(style.emoji, UserChatStyle.TRI_STATE_VALUES);
        if(styleAxis.equals(UserChatStyle.AXIS_DEFAULT) &&
           warmth.equals(UserChatStyle.AXIS_DEFAULT) &&
           enthusiasm.equals(UserChatStyle.AXIS_DEFAULT) &&
           headings.equals(UserChatStyle.AXIS_DEFAULT) &&
           emoji.equals(UserChatStyle.AXIS_DEFAULT))
            return "";
        final var lines = new ArrayList<String>();
        lines.add(AiPromptConstants.CHAT_STYLE_BLOCK_PREAMBLE);
        lines.add(PrintUtils.quickFormat("表达基调: {}", directiveOf(styleAxis)));
        if(!warmth.equals(UserChatStyle.AXIS_DEFAULT))
            lines.add(PrintUtils.quickFormat("温暖程度: {}", triStateOf(warmth, AiPromptConstants.CHAT_STYLE_WARMTH_LESS, AiPromptConstants.CHAT_STYLE_WARMTH_MORE)));
        if(!enthusiasm.equals(UserChatStyle.AXIS_DEFAULT))
            lines.add(PrintUtils.quickFormat("热情程度: {}", triStateOf(enthusiasm, AiPromptConstants.CHAT_STYLE_ENTHUSIASM_LESS, AiPromptConstants.CHAT_STYLE_ENTHUSIASM_MORE)));
        if(!headings.equals(UserChatStyle.AXIS_DEFAULT))
            lines.add(PrintUtils.quickFormat("标题组织: {}", triStateOf(headings, AiPromptConstants.CHAT_STYLE_HEADINGS_LESS, AiPromptConstants.CHAT_STYLE_HEADINGS_MORE)));
        if(!emoji.equals(UserChatStyle.AXIS_DEFAULT))
            lines.add(PrintUtils.quickFormat("表情使用: {}", triStateOf(emoji, AiPromptConstants.CHAT_STYLE_EMOJI_LESS, AiPromptConstants.CHAT_STYLE_EMOJI_MORE)));
        return String.join("\n", lines);
    }

    //* 白名单归一: null/未知值一律收敛为轴默认值 (default) — 失败方向是 "无风格" 而非 "未知风格".
    private static @NotNull String normalize(@Nullable String raw, @NotNull List<String> whitelist)
    {
        if(raw == null || !whitelist.contains(raw))
            return UserChatStyle.AXIS_DEFAULT;
        return raw;
    }

    //* style 轴取值 → 基调指令句 (七值全量映射, 归一保证不越值域).
    private static @NotNull String directiveOf(@NotNull String styleAxis)
    {
        return switch(styleAxis)
        {
            case "professional" -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_PROFESSIONAL;
            case "friendly"     -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_FRIENDLY;
            case "direct"       -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_DIRECT;
            case "optimist"     -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_OPTIMIST;
            case "pragmatic"    -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_PRAGMATIC;
            case "witty"        -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_WITTY;
            default             -> AiPromptConstants.CHAT_STYLE_DIRECTIVE_DEFAULT;
        };
    }

    //* 三态轴取值 → 修饰句: less/more 二选一, default 在拼装前已被行级守卫排除.
    private static @NotNull String triStateOf(@NotNull String value, @NotNull String less, @NotNull String more)
    {
        return "less".equals(value) ? less : more;
    }
}
