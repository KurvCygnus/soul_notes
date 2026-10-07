package kurvcygnus.soulnotes.domain.extension;

import org.jetbrains.annotations.NotNull;

/**
 * LLM 工具契约描述 (纯值对象, spec D3): 命令名 + 说明 + 参数树.
 * <p>刻意不含执行体 — REST 与 LLM 两出口共用 {@link IDataExtension#query} 同一实现 (D2),
 * 框架侧 (ExtensionToolProvider) 把本描述适配为 langchain4j {@code ToolSpecification}.</p>
 *
 * @param command     工具命令名 (LLM 调用动作名). 格式 {@code ^[a-zA-Z0-9_-]+$}, 全注册表唯一 (启动校验)
 * @param description LLM 看到的说明 (何时该调用我). 非空白 (启动校验)
 * @param parameters  参数树 (LLM 填参契约), 经 {@link Schema.Builder} 构造
 * @since 1.7.0
 */
public record LLMToolSpec(
    @NotNull String command,
    @NotNull String description,
    @NotNull ISchemaNode parameters
)
{
    public LLMToolSpec
    {
        if(command.isBlank())
            throw new IllegalArgumentException("Param \"command\" must not be blank!");
        if(description.isBlank())
            throw new IllegalArgumentException("Param \"description\" must not be blank!");
    }
}
