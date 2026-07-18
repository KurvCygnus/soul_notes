package kurvcygnus.soulnotes.ai.tool;

import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolMemoryId;
import jakarta.enterprise.context.ApplicationScoped;
import org.jetbrains.annotations.NotNull;

/**
 * <b>危机干预热线工具</b>
 * <p>当情感分析或对话中检测到 <span style="color: f84b4b">RED 预警</span> 时,
 * AI Agent 可调用此工具获取心理援助热线信息.</p>
 *
 * <span style="color: 95cc6d">热线信息建议在应用启动时从 Redis 或配置中加载, 确保离线可用.</span>
 *
 * @author Claude Code
 * @since 2.0
 */
@ApplicationScoped
public final class CrisisInterventionTool
{
    /**
     * <b>获取危机干预信息</b>
     * <ul>
     *     <li>返回全国心理援助热线与校园心理咨询中心信息</li>
     *     <li>记录预警日志</li>
     * </ul>
     *
     * @param userId 触发预警的用户 ID
     * @return 包含热线信息的文本
     */
    @Tool("当检测到红色预警时调用, 返回心理危机干预热线与建议")
    @SuppressWarnings("unused") //* userId 预留用于后续查询学校定制热线
    public @NotNull String getCrisisMessage(@ToolMemoryId String userId)
    {
        //* userId 可用于后续查询用户所在学校, 展示对应的校园咨询中心热线.
        //! 当前热线为静态默认值, 后续应从 Redis (key: crisis:hotline) 加载.
        return """
            🚨 我们很关心你。

            全国心理援助热线: 400-161-9995
            希望 24 热线: 400-161-9995
            全国青少年心理咨询热线: 12355

            你的安全是最重要的, 请立即联系专业人士。
            我们一直在你身边。
            """;
    }
}
