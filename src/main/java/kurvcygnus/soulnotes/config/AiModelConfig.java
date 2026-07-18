package kurvcygnus.soulnotes.config;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;

/**
 * <b>AI 模型配置</b>
 * <ul>
 *     <li>读取 {@code ai.openai.api-key} OpenAI API 密钥</li>
 *     <li>读取 {@code ai.openai.endpoint} 请求端点</li>
 *     <li>读取 {@code ai.openai.model-name} 模型名称</li>
 * </ul>
 *
 * <span style="color: 95cc6d">LangChain4j 原生配置由 {@code quarkus.langchain4j.openai.*} 自动管理,
 * 本类仅作为配置值的备用来源.</span>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class AiModelConfig
{
    private final @NotNull String apiKey;
    private final @NotNull String endpoint;
    private final @NotNull String modelName;

    public AiModelConfig(
        @ConfigProperty(name = "ai.openai.api-key") @NotNull String apiKey,
        @ConfigProperty(name = "ai.openai.endpoint") @NotNull String endpoint,
        @ConfigProperty(name = "ai.openai.model-name") @NotNull String modelName
    )
    {
        this.apiKey = apiKey;
        this.endpoint = endpoint;
        this.modelName = modelName;
    }

    public @NotNull String getApiKey() { return apiKey; }
    public @NotNull String getEndpoint() { return endpoint; }
    public @NotNull String getModelName() { return modelName; }
}
