package kurvcygnus.soulnotes.ai.agent;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * 候选追问 Agent.
 * <p>声明式 {@code @RegisterAiService} 接口, 依据最近一轮交换 (用户消息 + 助手回复) 生成 3 条用户
 * 最可能的追问, 供前端在回复气泡下追加"猜你想问"入口 (对齐商用 AI 对话的追问引导体验).</p>
 *
 * <p>所有配置 (model, temperature 等) 由 {@code application.properties} 中的
 * {@code quarkus.langchain4j.openai.*} 统一管理 ({@code SessionTitleAgent} 同款).
 * 追问属结构化收敛型任务, 理想参数为低温低上限 (温度 0.3 / max_tokens 150); 当前与全局模型共用
 * {@code quarkus.langchain4j.openai.chat-model.*}, 待引入命名模型作用域后再单独收敛.</p>
 *
 * @implNote 无工具无记忆的纯生成接口: 返回类型为 {@code String} (阻塞调用),
 *           调用方必须经 {@code vertx.executeBlocking} 置于 worker 线程执行
 *           (HR000068/069 纪律, {@code SessionTitleAgent} 同款), 生成失败由调用方 fail-open 兜底.
 *           显式 {@code @ApplicationScoped}: 本扩展默认把 AiService 注册为 {@code @RequestScoped},
 *           而追问生成运行在无请求上下文的流收尾/挂点线程, request scope 不可得;
 *           无工具无记忆不存在任何 per-request 状态, 应用级单例语义安全 (扩展按接口上的 scope 注解优先注册).
 *           //! 本 Agent 不接用户个性化 — 机构自定义提示词 (P2) 落地后同样豁免, 理由见
 *           {@code AiPromptConstants#FOLLOWUP_SYSTEM_PROMPT} 注释.
 * @since 1.8.0
 */
@SuppressWarnings("CdiManagedBeanInconsistencyInspection")//! 扩展按接口上的 scope 注解注册生成 Bean (AiService 默认 RequestScoped, 此处显式应用级单例);
//! IDE 的 CDI 检查不识别生成机制, 误报"托管 Bean 必须是具体的类" — 抑制理由如上, 运行时行为由集成测试钉死.
@ApplicationScoped
//* 工具单一供给裁决: 缺省 BeanIfExists 策略会把容器内唯一 ToolProvider bean (ExtensionToolProvider)
//! 套用到本 Agent, 追问请求携带工具定义直接击穿 mock-LLM 的追问路由契约 (SessionTitleAgent 实证先例);
//! 显式硬关断 (勿删).
@RegisterAiService(toolProviderSupplier = RegisterAiService.NoToolProviderSupplier.class)
public interface FollowupAgent
{
    /**
     * 依据最近一轮交换内容生成候选追问.
     *
     * @param systemPrompt   系统提示词 ({@code @V} 注入, 取 {@code AiPromptConstants} 内置默认)
     * @param userContent    本轮用户消息原文
     * @param assistantReply 本轮助手回复 (落库文本)
     * @return 严格 JSON 字符串数组的文本形态 (恰好 3 条); 数量或格式不合规由调用方解析容错整组拒绝
     */
    //* {@code @V("systemPrompt")} 可在 {@code @SystemMessage} 模板内解析: 与其余 Agent 同款声明风格,
    //* 提示词常量在 [[AiPromptConstants#FOLLOWUP_SYSTEM_PROMPT]].
    @SystemMessage("{{systemPrompt}}")
    @UserMessage("""
        用户消息:
        {{userContent}}

        助手回复:
        {{assistantReply}}

        请为这轮对话生成 3 条用户最可能的追问.
        """)
    String generateFollowups(
        @V("systemPrompt") String systemPrompt,
        @V("userContent") String userContent,
        @V("assistantReply") String assistantReply
    );
}
