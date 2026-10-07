package kurvcygnus.soulnotes.websocket;

import io.quarkus.websockets.next.OnClose;
import io.quarkus.websockets.next.OnOpen;
import io.quarkus.websockets.next.WebSocket;
import io.quarkus.websockets.next.WebSocketConnection;
import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.config.RedisStartupConfig;
import kurvcygnus.soulnotes.utils.JsonUtils;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.UUID;

/**
 * RED 预警推送 WebSocket 端点 ({@code /ws/alert}), 承担在线用户的强预警弹窗通道.
 * <ul>
 *     <li>用户连接时注册到 {@link ConcurrentHashMap}, 断开时移除</li>
 *     <li>提供 {@link #pushAlert(UUID, String)} 方法供业务方触发预警推送</li>
 * </ul>
 *
 * @implNote 连接身份来自升级期 {@link WebSocketAuthUpgradeCheck} 写入 UserData 的 userId;
 *           推送负载为 JSON ({@code type/message/hotline}), hotline 与 webhook 渠道同源解析.
 * @since 1.0
 */
@WebSocket(path = "/ws/alert")
public class AlertWebSocket
{
    private static final Logger LOG = LoggerFactory.getLogger(AlertWebSocket.class);

    //region 注入
    private final @NotNull RedisStartupConfig redisConfig;

    @Inject public AlertWebSocket(@NotNull RedisStartupConfig redisConfig) { this.redisConfig = redisConfig; }
    //endregion

    //region 连接追踪
    //* userId → [[WebSocketConnection]] 映射 (注册表独立成类: 双连接竞态语义可被单元测试钉住).
    private final @NotNull AlertConnectionRegistry connections = new AlertConnectionRegistry();

    //! 生命周期回调由框架通过反射调用, IDE 静态分析误报为未使用.
    @OnOpen @SuppressWarnings("unused")
    public void onOpen(@NotNull WebSocketConnection connection)
    {
        final var userIdStr = connection.userData().get(WebSocketAuthUpgradeCheck.USER_ID_KEY);
        if(userIdStr == null)
            return;
        final var userId = UUID.fromString(userIdStr);
        connections.register(userId, connection);
        LOG.info("预警连接已建立: userId={}", userId);
    }

    @OnClose @SuppressWarnings("unused")
    public void onClose(@NotNull WebSocketConnection connection)
    {
        final var userIdStr = connection.userData().get(WebSocketAuthUpgradeCheck.USER_ID_KEY);
        if(userIdStr == null)
            return;
        connections.unregister(UUID.fromString(userIdStr), connection);
        LOG.info("预警连接已关闭: userId={}", userIdStr);
    }
    //endregion

    //region 预警推送
    /**
     * 向指定用户推送 RED 预警 (含热线号码的 JSON 负载).
     *
     * @param userId  目标用户 ID
     * @param message 预警消息
     * @return 完成信号, 恒成功完成: 用户不在线时静默跳过 (仅 WARN), 发送异常也只记日志 —
     *         预警分发绝不拖垮调用方主流程
     */
    @SuppressWarnings("NullableProblems") public @NotNull Uni<Void> pushAlert(@NotNull UUID userId, @NotNull String message)
    {
        final var conn = connections.connectionOf(userId);
        if(conn == null)
        {
            LOG.warn("用户不在线, 预警推送跳过: userId={}", userId);
            return Uni.createFrom().voidItem();
        }

        return resolveHotline().flatMap(
            hotline ->
            {
                final var payload = new LinkedHashMap<String, String>();
                payload.put("type", "RED_ALERT");
                payload.put("message", message);
                payload.put("hotline", hotline);
                //* 预约入口随弹窗下发: 空串表示机构未配置, 前端判空隐藏 "预约咨询" 按钮.
                payload.put("appointmentUrl", redisConfig.getAppointmentUrl());

                try
                {
                    final var json = JsonUtils.toJson(payload);
                    return conn.sendText(json);
                }
                catch(Exception e)
                {
                    LOG.warn("预警推送失败: userId={}, {}", userId, e.getMessage());
                    return Uni.createFrom().voidItem();
                }
            }
        );
    }
    //endregion

    //region 扩展通知推送 (P3 Task 1)
    /**
     * 向指定用户推送扩展通知 ({@code ext-notification} 事件, 与 RED 预警共用本通道的用户级推送语义).
     *
     * @param userId 目标用户 ID
     * @param title  通知标题
     * @param body   通知正文
     * @param tag    通知标签 (规则 ID, 前端/壳桥据此分组与去重)
     * @return 完成信号, 恒成功完成: 用户不在线时静默跳过 (仅 DEBUG — 扩展通知无离线补偿, 语义上允许错过),
     *         发送异常也只记日志 — 通知分发绝不拖垮调用方 (调度链)
     * @since 2.2.0
     */
    public @NotNull Uni<Void> pushExtNotification(@NotNull UUID userId, @NotNull String title, @NotNull String body, @NotNull String tag)
    {
        final var conn = connections.connectionOf(userId);
        if(conn == null)
        {
            LOG.debug("用户不在线, 扩展通知跳过: userId={}, tag={}", userId, tag);
            return Uni.createFrom().voidItem();
        }
        final var payload = new LinkedHashMap<String, String>();
        payload.put("type", "ext-notification");
        payload.put("title", title);
        payload.put("body", body);
        payload.put("tag", tag);
        try { return conn.sendText(JsonUtils.toJson(payload)).
            //* 链尾收口恒成功: 连接关闭竞态等异步发送失败若以失败信号上抛, 会经调度链的 chain 传播
            //! 中止本轮剩余绑定 (且本条幂等键已消费 — 下发机会已用掉, 重试无从谈起); Mutiny 3.2 无
            //! recoverWithVoid, recoverWithNull 即 Uni<Void> 的等价恢复形 (null 项 = 完成信号).
            onFailure().invoke(e -> LOG.warn("扩展通知异步发送失败: userId={}, tag={}, {}", userId, tag, e.getMessage())).
            onFailure().recoverWithNull(); }
        catch(Exception e)
        {
            LOG.warn("扩展通知推送失败: userId={}, tag={}, {}", userId, tag, e.getMessage());
            return Uni.createFrom().voidItem();
        }
    }
    //endregion

    //region 热线解析
    /**
     * 从 Redis 或配置中解析热线主号码.
     *
     * @return 主号码; 解析逻辑收编至 {@link IAlertNotifier#primaryHotlineOf},
     *         与 Webhook 渠道共享同一来源, 防止两处漂移
     */
    private @NotNull Uni<String> resolveHotline() { return redisConfig.getHotline().map(IAlertNotifier::primaryHotlineOf); }

    //endregion
}
