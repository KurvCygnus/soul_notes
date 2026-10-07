package kurvcygnus.soulnotes.ai.agent;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * 会话标题 Agent.
 * <p>声明式 {@code @RegisterAiService} 接口, 依据会话首轮交换 (用户消息 + 助手回复)
 * 生成一个短标题, 供侧栏会话列表主行与主区左上角展示 (对齐商用 AI 对话的会话命名体验).</p>
 *
 * <p>所有配置 (model, temperature 等) 由 {@code application.properties} 中的
 * {@code quarkus.langchain4j.openai.*} 统一管理.</p>
 *
 * @implNote 无工具无记忆的纯生成接口: 返回类型为 {@code String} (阻塞调用),
 *           调用方必须经 {@code vertx.executeBlocking} 置于 worker 线程执行
 *           (HR000068/069 纪律, {@code DailySummaryAgent} 同款), 生成失败由调用方 fail-open 兜底.
 *           显式 {@code @ApplicationScoped}: 本扩展默认把 AiService 注册为 {@code @RequestScoped},
 *           而标题生成运行在无请求上下文的流收尾/挂点线程, request scope 不可得;
 *           无工具无记忆不存在任何 per-request 状态, 应用级单例语义安全 (扩展按接口上的 scope 注解优先注册).
 * @since 1.6.0
 */
@SuppressWarnings("CdiManagedBeanInconsistencyInspection")//! 扩展按接口上的 scope 注解注册生成 Bean (AiService 默认 RequestScoped, 此处显式应用级单例);
//! IDE 的 CDI 检查不识别生成机制, 误报"托管 Bean 必须是具体的类" — 抑制理由如上, 运行时行为由集成测试钉死.
@ApplicationScoped
//* 工具单一供给裁决: 缺省 BeanIfExists 策略会把容器内唯一 ToolProvider bean (ExtensionToolProvider)
//! 套用到本 Agent, 标题请求携带工具定义直接击穿 mock-LLM 的标题路由契约 (集成测试实证); 显式硬关断 (勿删).
@RegisterAiService(toolProviderSupplier = RegisterAiService.NoToolProviderSupplier.class)
public interface SessionTitleAgent
{
    /**
     * 依据首轮交换内容生成会话标题.
     *
     * @param systemPrompt   系统提示词 ({@code @V} 注入, 取 {@code AiPromptConstants} 内置默认)
     * @param userContent    首条用户消息原文
     * @param assistantReply 首条助手回复 (落库文本)
     * @return 标题文本 (短句); 空白回复由调用方拒绝落库并走兜底标题
     */
    //* {@code @V("systemPrompt")} 可在 {@code @SystemMessage} 模板内解析: 与其余 Agent 同款声明风格,
    //* 提示词常量在 [[AiPromptConstants#SESSION_TITLE_SYSTEM_PROMPT]].
    @SystemMessage("{{systemPrompt}}")
    @UserMessage("""
        用户消息:
        {{userContent}}

        助手回复:
        {{assistantReply}}

        请为这段对话生成标题.
        """)
    String generateTitle(
        @V("systemPrompt") String systemPrompt,
        @V("userContent") String userContent,
        @V("assistantReply") String assistantReply
    );
}
