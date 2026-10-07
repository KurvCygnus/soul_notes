package kurvcygnus.soulnotes.websocket;

import io.quarkus.websockets.next.WebSocketConnection;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 预警在线连接注册表: userId → [[WebSocketConnection]] 的线程安全映射.
 * <p>独立成类的原因: 同账号双连接的生命周期交错 (断线重连/StrictMode 重挂/旧连接迟到关闭) 是
 * {{@link AlertWebSocket}} 的核心竞态, 注销必须做<strong>同连接校验</strong>才允许摘除映射 —
 * 该语义值得被单元测试钉住, 而非藏在前端点的私有 map 里.</p>
 *
 * @implNote 注销采用 {@link ConcurrentHashMap#remove(Object, Object)} 两参形态: 仅当当前映射仍指向
 *           <em>正在关闭的那条连接</em> 时才移除. 反例 (曾因此产出线上缺陷): 无条件 {@code remove(userId)}
 *           会把 "后建连接覆盖注册 → 先建连接迟到关闭" 的场景误判为用户离线 — 连接 B 明明存活,
 *           RED 预警却被 "用户不在线" 跳过, 在线强预警通道整体失效.
 * @since 1.6.0
 */
final class AlertConnectionRegistry
{
    //* userId → 当前注册连接 (同账号重连时后者覆盖前者).
    private final @NotNull Map<UUID, WebSocketConnection> connections = new ConcurrentHashMap<>();

    /**
     * 注册 (或覆盖) 用户的在线连接.
     *
     * @param userId     用户 ID
     * @param connection 新建立的连接
     */
    void register(@NotNull UUID userId, @NotNull WebSocketConnection connection) { connections.put(userId, connection); }

    /**
     * 注销连接: 仅当映射当前仍指向该连接时才移除 (同连接校验).
     *
     * @param userId     用户 ID
     * @param connection 正在关闭的连接
     */
    void unregister(@NotNull UUID userId, @NotNull WebSocketConnection connection) { connections.remove(userId, connection); }

    /**
     * 查询用户当前的在线连接.
     *
     * @param userId 用户 ID
     * @return 在线连接; 用户不在线时为 {@code null}
     */
    @Nullable WebSocketConnection connectionOf(@NotNull UUID userId) { return connections.get(userId); }
}
