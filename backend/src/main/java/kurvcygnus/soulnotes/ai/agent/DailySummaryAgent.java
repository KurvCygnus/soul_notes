package kurvcygnus.soulnotes.ai.agent;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * 每日总结 Agent.
 * <p>声明式 {@code @RegisterAiService} 接口, 依据用户近期的会话摘录,
 * 生成当日总结留言 (一句抽象总结 + 一条行动建议合并文本).</p>
 *
 * <p>所有配置 (model, temperature 等) 由 {@code application.properties} 中的
 * {@code quarkus.langchain4j.openai.*} 统一管理.</p>
 *
 * @implNote 无工具无记忆的纯生成接口: 返回类型为 {@code String} (阻塞调用),
 *           调用方必须经 {@code vertx.executeBlocking} 置于 worker 线程执行
 *           (与 {@code ChatService} 同一 HR000068/069 纪律), 生成失败由调用方 fail-open 兜底.
 *           显式 {@code @ApplicationScoped}: 本扩展默认把 AiService 注册为 {@code @RequestScoped},
 *           而本 Agent 的消费方 (每日总结调度) 运行在无请求上下文的调度线程, request scope 不可得;
 *           无工具无记忆不存在任何 per-request 状态, 应用级单例语义安全 (扩展按接口上的 scope 注解优先注册).
 * @implNote 情绪分析双输入已随日记域砍除 (走查裁决 2026-10-03), 输入收敛为会话摘录单源.
 * @since 1.5.0
 */
@SuppressWarnings("CdiManagedBeanInconsistencyInspection")//! 扩展按接口上的 scope 注解注册生成 Bean (AiService 默认 RequestScoped, 此处显式应用级单例);
//! IDE 的 CDI 检查不识别生成机制, 误报"托管 Bean 必须是具体的类" — 抑制理由如上, 运行时行为由集成测试钉死.
@ApplicationScoped
//* 工具单一供给裁决: 缺省 BeanIfExists 策略会把容器内唯一 ToolProvider bean (ExtensionToolProvider)
//! 套用到本 Agent, 总结请求携带工具定义 (与 SessionTitleAgent 同款问题); 显式硬关断 (勿删).
@RegisterAiService(toolProviderSupplier = RegisterAiService.NoToolProviderSupplier.class)
public interface DailySummaryAgent
{
    /**
     * 生成用户当日总结留言.
     *
     * @param systemPrompt   系统提示词 ({@code @V} 注入, 当前取 {@code AiPromptConstants} 内置默认,
     *                       尚未接 {@code ai.prompt.*} 配置化)
     * @param sessionExcerpt 用户近期会话消息摘录 (最近会话向前滚动约 20 条, 单条截断)
     * @return 总结留言正文 (一句总结 + 行动建议); 空白回复由调用方拒绝落库
     */
    //* {@code @V("systemPrompt")} 可在 {@code @SystemMessage} 模板内解析: 与其余 Agent 同款声明风格,
    //* 提示词常量在 [[AiPromptConstants#DAILY_SUMMARY_SYSTEM_PROMPT]], 配置化接线留给后续任务.
    @SystemMessage("{{systemPrompt}}")
    @UserMessage("""
        用户近期对话摘录:
        {{sessionExcerpt}}

        请据此生成今日总结.
        """)
    String summarize(
        @V("systemPrompt") String systemPrompt,
        @V("sessionExcerpt") String sessionExcerpt
    );
}
