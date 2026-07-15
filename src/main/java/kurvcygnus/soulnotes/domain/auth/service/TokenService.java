package kurvcygnus.soulnotes.domain.auth.service;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.value.ReactiveValueCommands;
import io.smallrye.jwt.build.Jwt;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.auth.entity.User;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;

//? 配置已在构造函数中通过 [[ReactiveRedisDataSource]] 注入完成.

/**
 * <b>JWT 令牌服务</b>
 * <ul>
 *     <li>签发 JWT、校验 JWT、将 Token 加入 Redis 黑名单以实现登出</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class TokenService
{
    //region 常量
    //! jti 前缀, 用于 Redis 黑名单 Key 的构建与 JWT 声明的匹配.
    private static final @NotNull String BLACKLIST_PREFIX = "jwt:blacklist:";
    //endregion

    //region 注入
    private final @NotNull ReactiveValueCommands<String, String> redisValues;
    private final @NotNull String jwtSecret;

    //* Token TTL (秒), 默认 7 天.
    private final long ttlSeconds;

    //* 使用 [[ReactiveRedisDataSource]] 获取响应式 Redis 操作接口.
    public TokenService(
        @NotNull ReactiveRedisDataSource redisDS,
        @ConfigProperty(name = "jwt.secret") @NotNull String jwtSecret,
        @ConfigProperty(name = "jwt.ttl-seconds", defaultValue = "604800") long ttlSeconds
    )
    {
        this.redisValues = redisDS.value(String.class);
        this.jwtSecret  = jwtSecret;
        this.ttlSeconds = ttlSeconds;
    }
    //endregion

    //region 核心方法
    /**
     * <span style="color: 95cc6d">为指定用户生成 JWT.</span>
     *
     * @param user 用户实体
     * @return 签名后的 JWT 字符串
     */
    public @NotNull String generateToken(@NotNull User user)
    {
        final var now        = Instant.now();
        final var expiration = now.plus(Duration.ofSeconds(ttlSeconds));

        return Jwt.issuer("soul-notes").
            subject(user.id.toString()).
            upn(user.username).
            groups(Set.of(user.role.name())).
            issuedAt(now).
            expiresAt(expiration).
            signWithSecret(jwtSecret);
    }

    /**
     * <span style="color: 95cc6d">将 Token 加入黑名单 (直到其原始过期时间).</span>
     * <p>黑名单 Key 格式: {@code jwt:blacklist:{jti}}</p>
     *
     * @param token 待注销的 JWT
     * @return {@link Uni<Void>}
     */
    public @NotNull Uni<Void> invalidateToken(@NotNull String token)
    {
        //* 从 JWT 中提取 jti 并计算剩余有效期.
        final var parts = token.split("\\.");
        if(parts.length < 2)
            return Uni.createFrom().voidItem();

        final var jti = extractJti(token);

        //! 使用配置的 TTL 作为黑名单过期时间; 实际可解析 exp 声明精确计算剩余时间.
        return redisValues.
            setex(BLACKLIST_PREFIX + jti, ttlSeconds, "true").
            replaceWithVoid();
    }

    /**
     * <span style="color: f84b4b">检查 Token 是否已被列入黑名单.</span>
     *
     * @param jti JWT 的 jti 声明
     * @return {@code true} 若该 Token 已被注销
     */
    public @NotNull Uni<Boolean> isBlacklisted(@NotNull String jti) { return redisValues.get(BLACKLIST_PREFIX + jti).map(Objects::nonNull); }
    //endregion

    //region 辅助方法
    private static @NotNull String extractJti(@NotNull String token)
    {
        //* 使用 payload 的 SHA-256 哈希作为 jti, 避免 hashCode() 的碰撞风险.
        final var parts = token.split("\\.");
        if(parts.length < 2)
            return sha256Hex(token);
        return sha256Hex(parts[1]);
    }

    private static @NotNull String sha256Hex(@NotNull String input)
    {
        try
        {
            final var digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes()));
        }
        catch(NoSuchAlgorithmException e) { throw new RuntimeException("SHA-256 不可用", e); }
    }
    //endregion
}