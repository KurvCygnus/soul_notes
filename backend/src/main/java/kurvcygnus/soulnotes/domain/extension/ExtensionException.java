package kurvcygnus.soulnotes.domain.extension;

import org.jetbrains.annotations.NotNull;

/**
 * 数据扩展注册校验异常 (spec D4): 启动期任一契约违例 (命名/命令格式与唯一性/描述非空/
 * schema 结构不变式/参数树与 argsType 对齐) 即抛出 — 配置与契约错误必须在部署前暴露,
 * 是扩展体系唯一的硬失败点 (其余全 fail-open).
 *
 * @author Claude Code
 * @since 1.7.0
 */
public final class ExtensionException extends RuntimeException
{
    public ExtensionException(@NotNull String message) { super(message); }

    public ExtensionException(@NotNull String message, @NotNull Throwable cause) { super(message, cause); }
}
