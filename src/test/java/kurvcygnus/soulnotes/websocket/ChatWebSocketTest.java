package kurvcygnus.soulnotes.websocket;

import io.quarkus.websockets.next.InboundProcessingMode;
import io.quarkus.websockets.next.WebSocket;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ChatWebSocket} 结构单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class ChatWebSocketTest
{
    @Test void class_ShouldBeNonFinal()
    {
        assertFalse(Modifier.isFinal(ChatWebSocket.class.getModifiers()));
    }

    @Test void class_ShouldHaveWebSocketAnnotation()
    {
        final var ws = ChatWebSocket.class.getAnnotation(WebSocket.class);
        assertNotNull(ws);
        assertEquals("/ws/chat", ws.path());
        assertEquals(InboundProcessingMode.SERIAL, ws.inboundProcessingMode());
    }

    @Test void constructor_TakesChatService() throws Exception
    {
        final var constructor = ChatWebSocket.class.getDeclaredConstructor(kurvcygnus.soulnotes.domain.chat.service.ChatService.class);
        assertNotNull(constructor);
    }

    @Test void methods_OnMessageExists() throws Exception
    {
        assertNotNull(ChatWebSocket.class.getDeclaredMethod("onMessage", String.class, io.quarkus.websockets.next.WebSocketConnection.class));
    }
}
