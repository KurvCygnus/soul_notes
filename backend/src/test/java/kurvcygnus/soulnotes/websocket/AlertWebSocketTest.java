package kurvcygnus.soulnotes.websocket;

import io.quarkus.websockets.next.WebSocket;
import io.smallrye.mutiny.Uni;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link AlertWebSocket} 结构单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class AlertWebSocketTest
{
    @Test void class_ShouldBeNonFinal()
    {
        assertFalse(Modifier.isFinal(AlertWebSocket.class.getModifiers()));
    }

    @Test void class_ShouldHaveWebSocketAnnotation()
    {
        final var ws = AlertWebSocket.class.getAnnotation(WebSocket.class);
        assertNotNull(ws);
        assertEquals("/ws/alert", ws.path());
    }

    @Test void method_PushAlertExists() throws Exception
    {
        final var method = AlertWebSocket.class.getMethod("pushAlert", UUID.class, String.class);
        assertNotNull(method);
        assertEquals(Uni.class, method.getReturnType());
    }
}
