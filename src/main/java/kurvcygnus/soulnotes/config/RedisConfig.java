package kurvcygnus.soulnotes.config;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;

/**
 * <b>Redis 连接配置</b>
 * <p>读取 {@code quarkus.redis.hosts} 属性。</p>
 * <p><i>Quarkus 已自动配置 <u>{@link io.quarkus.redis.datasource.ReactiveRedisDataSource}</u>；
 * 此配置类集中管理连接参数，为使用原生 <u>{@code RedisClient}</u> 的场景预留。</i></p>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class RedisConfig
{
    private final @NotNull String hosts;

    public RedisConfig(@ConfigProperty(name = "quarkus.redis.hosts") @NotNull String hosts) { this.hosts = hosts; }

    public @NotNull String getHosts() { return hosts; }
}
