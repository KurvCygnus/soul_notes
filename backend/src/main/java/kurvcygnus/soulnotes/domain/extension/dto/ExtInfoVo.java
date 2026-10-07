package kurvcygnus.soulnotes.domain.extension.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * 扩展元信息 VO: {@code GET /api/v1/ext} 负载项, 前端/网关据此感知注册表里有哪些数据扩展、
 * 以及各自是否携带 LLM 工具契约.
 * <p>{@code NON_NULL} 序列化: {@code name} 恒在场; 仅暴露给 LLM 的扩展才有后三个字段,
 * REST-only 扩展 (aiCallCommand 为 null) 的三键整体缺席, 而非以 {@code null} 噪声占位.</p>
 *
 * @param name        扩展 ID (REST 查阅路径段, {@code /api/v1/ext/{name}/query})
 * @param command     LLM 工具命令名; REST-only 扩展为 {@code null}
 * @param description LLM 看到的工具说明 (何时该调用); REST-only 扩展为 {@code null}
 * @param parameters  参数树 (LLM 填参契约, Jackson 直接序列化为 JSON 对象); REST-only 扩展为 {@code null}
 * @since 1.7.0
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExtInfoVo(
    @NotNull String name,
    @Nullable String command,
    @Nullable String description,
    @Nullable ISchemaNode parameters
) {}
