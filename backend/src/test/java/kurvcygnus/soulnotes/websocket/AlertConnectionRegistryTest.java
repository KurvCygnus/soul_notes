package kurvcygnus.soulnotes.websocket;

import io.quarkus.websockets.next.WebSocketConnection;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link AlertConnectionRegistry} 双连接竞态回归测试</b>
 * <p>钉住注销的同连接校验语义: 旧连接迟到关闭不得误摘新连接的注册 (曾因无条件 remove 产出
 * "用户在线却被判离线, RED 预警推送跳过" 的通道级失效).</p>
 *
 * @author Claude Code
 * @since 1.6.0
 */
class AlertConnectionRegistryTest
{
    //* 零行为代理 fake: 注册表只做身份映射, 连接实例无需任何行为.
    //! equals/hashCode 必须保留 Object 同一性语义 — 动态代理会把它们也路由进 handler,
    //! 而两参 remove(key, value) 内部要调 value.equals, 恒返 null 的 handler 会在那里 NPE.
    static WebSocketConnection fakeConnection()
    {
        return (WebSocketConnection) Proxy.newProxyInstance(
            AlertConnectionRegistryTest.class.getClassLoader(),
            new Class<?>[] { WebSocketConnection.class },
            (proxy, method, args) ->
            {
                return switch(method.getName())
                {
                    case "equals" -> proxy == args[0];
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "toString" -> "FakeWebSocketConnection";
                    default -> null;
                };
            }
        );
    }

    @Test void unregister_ShouldKeepNewerConnection_WhenStaleConnectionCloses()
    {
        final var registry = new AlertConnectionRegistry();
        final var userId = UUID.randomUUID();
        final var stale = fakeConnection();
        final var fresh = fakeConnection();

        registry.register(userId, stale);
        registry.register(userId, fresh);
        registry.unregister(userId, stale); //* 竞态现场: 新连接已覆盖注册, 旧连接才迟到关闭.

        assertSame(fresh, registry.connectionOf(userId));
    }

    @Test void unregister_ShouldRemoveMapping_WhenClosingConnectionIsTheRegisteredOne()
    {
        final var registry = new AlertConnectionRegistry();
        final var userId = UUID.randomUUID();
        final var connection = fakeConnection();

        registry.register(userId, connection);
        registry.unregister(userId, connection);

        assertNull(registry.connectionOf(userId));
    }

    @Test void connectionOf_ShouldReturnNull_WhenUserNeverRegistered()
    {
        assertNull(new AlertConnectionRegistry().connectionOf(UUID.randomUUID()));
    }
}
