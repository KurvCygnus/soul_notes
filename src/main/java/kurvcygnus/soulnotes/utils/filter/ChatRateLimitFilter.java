package kurvcygnus.soulnotes.utils.filter;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.keys.ReactiveKeyCommands;
import io.quarkus.redis.datasource.value.ReactiveValueCommands;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.constants.RedisKeyConstants;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

/**
 * <b>聊天 API 限流过滤器</b>
 * <ul>
 *     <li>限制 {@code /api/v1/chat/send} 和 {@code /api/v1/chat/stream} 的请求频率</li>
 *     <li>使用 Redis 响应式计数器, 每分钟上限 20 次</li>
 *     <li>超限返回 {@code 429 Too Many Requests}</li>
 * </ul>
 *
 * <span style="color: 95cc6d">采用 {@code @ServerRequestFilter} + {@code Uni<Response>} 响应式实现,
 * 全程无阻塞, 不会占用事件循环.</span>
 *
 * @author Claude Code
 * @since 2.0
 */
@ApplicationScoped
@SuppressWarnings("unused")//! @ServerRequestFilter 由 RESTEasy Reactive 注解扫描发现, IDE 静态分析误报类与方法未使用.
public final class ChatRateLimitFilter
{
    private static final Logger LOG = LoggerFactory.getLogger(ChatRateLimitFilter.class);

    //* 每分钟最多 20 次对话请求.
    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final int WINDOW_SECONDS = 60;

    //* 仅对聊天端点生效 (复用常量避免路径漂移).
    private static final String CHAT_SEND_PATH   = ApiEndpointConstants.CHAT_BASE + "/send";
    private static final String CHAT_STREAM_PATH = ApiEndpointConstants.CHAT_BASE + "/stream";

    private final @NotNull ReactiveValueCommands<String, String> redisValues;
    private final @NotNull ReactiveKeyCommands<String> redisKeys;

    public ChatRateLimitFilter(@NotNull ReactiveRedisDataSource redisDS)
    {
        this.redisValues = redisDS.value(String.class);
        this.redisKeys   = redisDS.key(String.class);
    }

    /**
     * <span style="color: 95cc6d">响应式限流过滤.</span>
     * <p>返回非 {@code null} 的 {@link Response} 时中止处理, 返回 {@code null} 时放行.</p>
     */
    @ServerRequestFilter(priority = Priorities.AUTHORIZATION - 10)
    public @NotNull Uni<Response> filter(@NotNull UriInfo uriInfo, @NotNull HttpHeaders httpHeaders)
    {
        //* 仅拦截聊天端点.
        final var path = uriInfo.getPath();
        if(!path.equals(CHAT_SEND_PATH) && !path.equals(CHAT_STREAM_PATH))
            return Uni.createFrom().nullItem();

        //* 从 Authorization header 提取 userId (JWT subject, 此时尚未验签, 仅作限流维度).
        final var userId = extractUserId(httpHeaders);
        if(userId == null)
            return Uni.createFrom().nullItem();

        final var key = RedisKeyConstants.RATE_LIMIT.formatted("chat", userId);

        //* 使用 Redis INCR 计数, 首次调用时设置 TTL.
        return redisValues.incr(key).
            flatMap(
                count ->
                {
                    if(count == 1)
                        return redisKeys.expire(key, Duration.ofSeconds(WINDOW_SECONDS)).replaceWith(count);
                    return Uni.createFrom().item(count);
                }
            ).
            map(
                count ->
                {
                    if(count > MAX_REQUESTS_PER_MINUTE)
                    {
                        LOG.warn("聊天限流触发: userId={}, count={}", userId, count);
                        return Response.status(Response.Status.TOO_MANY_REQUESTS).
                            entity("{\"code\":429001,\"message\":\"请求过于频繁, 请稍后再试\"}").
                            type("application/json").
                            build();
                    }
                    return null;
                }
            ).
            onFailure().recoverWithItem(
                t ->
                {
                    //! Redis 不可用时降级, 允许请求通过.
                    LOG.warn("限流 Redis 操作失败, 降级放行: {}", t.getMessage());
                    return null;
                }
            );
    }

    //region 辅助方法

    /**
     * <span style="color: 95cc6d">从 JWT Authorization header 中提取用户 ID.</span>
     * <p>解析 JWT payload (base64) 中的 {@code sub} claim, 获取 UUID 格式的用户 ID.</p>
     */
    private static @Nullable String extractUserId(@NotNull HttpHeaders headers)
    {
        try
        {
            final var auth = headers.getHeaderString("Authorization");
            if(auth == null || !auth.startsWith("Bearer "))
                return null;

            final var token = auth.substring(7);
            final var parts = token.split("\\.");
            if(parts.length < 2)
                return null;

            final var decoded = Base64.getUrlDecoder().decode(parts[1]);
            final var payload = new String(decoded);

            //* 简单 JSON 解析提取 sub (避免依赖 Jackson ObjectMapper).
            final var subKey = "\"sub\":\"";
            final var subIdx = payload.indexOf(subKey);
            if(subIdx < 0)
                return null;

            final var start = subIdx + subKey.length();
            final var end   = payload.indexOf("\"", start);
            if(end <= start)
                return null;

            final var sub = payload.substring(start, end);
            UUID.fromString(sub); //! 非 UUID 格式会抛出异常
            return sub;
        }
        catch(Exception e)
        {
            LOG.warn("从 JWT 提取 userId 失败: {}", e.getMessage());
            return null;
        }
    }

    //endregion
}
