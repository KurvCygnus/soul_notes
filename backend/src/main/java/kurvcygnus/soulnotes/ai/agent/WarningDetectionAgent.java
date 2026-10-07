package kurvcygnus.soulnotes.ai.agent;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import kurvcygnus.soulnotes.ai.dto.WarningDetectionResult;

/**
 * 预警检测 Agent.
 * <p>声明式 {@code @RegisterAiService} 接口, 分析文本中是否存在自我伤害、自杀倾向等高风险信号.</p>
 *
 * <p>当结果为 {@code RED} 时, 系统必须触发危机干预流程 (前端弹窗 + 热线推送).</p>
 *
 * @implNote 安全边界: 本 Agent 的 system prompt 恒为预警检测提示词, <b>一律不注入用户聊天风格块</b>
 *           (chat-style, P2 Task 1) — 用户措辞偏好绝不影响预警判定语义 (消费点 ChatService#detectWarning).
 * @since 1.0
 */
//* 工具单一供给裁决: toolProviderSupplier 缺省为 BeanIfExists 策略 — 容器内一旦存在 ToolProvider bean
//! (ExtensionToolProvider) 就会连本 Agent 一起套用, 预警请求携带工具定义既拖慢安全链路又给真实 LLM 留下
//! 工具调用分叉面; 本接口按设计零工具, 显式 NoToolProviderSupplier 硬关断 (勿删).
@RegisterAiService(toolProviderSupplier = RegisterAiService.NoToolProviderSupplier.class)
public interface WarningDetectionAgent
{
    /**
     * 检测文本中的高风险信号.
     *
     * @param systemPrompt 系统提示词 ({@code @V} 注入, 提示词配置化 ai.prompt.* 的接线点)
     * @param content 待检测文本 (用户消息/日记)
     * @return 结构化检测结果 ({@code RED} 触发危机干预流程)
     */
    //* {@code @V("systemPrompt")} 可在 {@code @SystemMessage} 模板内解析: 提示词配置化 (ai.prompt.*) 的接线点,
    //* 内置默认人设由 PromptProvider 回退保证, Agent 侧不再硬编码常量.
    @SystemMessage("{{systemPrompt}}")
    @UserMessage("{{content}}")
    WarningDetectionResult detect(@V("systemPrompt") String systemPrompt, @V("content") String content);
}
