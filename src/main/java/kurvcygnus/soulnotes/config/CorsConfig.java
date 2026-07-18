package kurvcygnus.soulnotes.config;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;

/**
 * <b>CORS 跨域配置</b>
 * <p>通过 <u>{@code quarkus.http.cors.*}</u> 属性读取 Quarkus 内置的 CORS 设置。</p>
 * <p><i>Quarkus 已通过 {@code application.properties} 自动配置 CORS filter；
 * 此配置类将属性集中化，为程序化 CORS 控制预留扩展点。</i></p>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class CorsConfig
{
    private final @NotNull String origins;
    private final @NotNull String methods;
    private final @NotNull String headers;

    public CorsConfig(
        @ConfigProperty(name = "quarkus.http.cors.origins") @NotNull String origins,
        @ConfigProperty(name = "quarkus.http.cors.methods") @NotNull String methods,
        @ConfigProperty(name = "quarkus.http.cors.headers") @NotNull String headers
    )
    {
        this.origins = origins;
        this.methods = methods;
        this.headers = headers;
    }

    public @NotNull String getOrigins() { return origins; }
    public @NotNull String getMethods() { return methods; }
    public @NotNull String getHeaders() { return headers; }
}
