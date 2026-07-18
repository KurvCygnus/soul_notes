package kurvcygnus.soulnotes.config;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;

/**
 * <b>JWT 配置</b>
 * <ul>
 *     <li>读取 {@code jwt.secret} 签名密钥</li>
 *     <li>读取 {@code jwt.ttl-seconds} Token 有效期（秒）</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class JwtConfig
{
    private final @NotNull String secret;
    private final long ttlSeconds;

    public JwtConfig(
        @ConfigProperty(name = "jwt.secret") @NotNull String secret,
        @ConfigProperty(name = "jwt.ttl-seconds", defaultValue = "604800") long ttlSeconds
    )
    {
        this.secret = secret;
        this.ttlSeconds = ttlSeconds;
    }

    public @NotNull String getSecret() { return secret; }
    public long getTtlSeconds() { return ttlSeconds; }
}
