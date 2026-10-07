package kurvcygnus.soulnotes.domain.chat.resource;

import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.Path;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ChatResource} 结构单元测试</b>
 *
 * @author Claude Code
 * @since 1.1.0
 */
class ChatResourceTest
{
    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(ChatResource.class.getModifiers()));
    }

    @Test void class_ShouldHavePathAnnotation()
    {
        final var path = ChatResource.class.getAnnotation(Path.class);
        assertNotNull(path);
        assertEquals(ApiEndpointConstants.CHAT_BASE, path.value());
    }

    @Test void class_ShouldHaveRolesAllowed()
    {
        assertTrue(ChatResource.class.isAnnotationPresent(RolesAllowed.class));
    }

    @Test void methods_SendStreamAndListSessionsExist() throws Exception
    {
        assertNotNull(ChatResource.class.getMethod("send", kurvcygnus.soulnotes.domain.chat.dto.ChatSendRequest.class));
        assertNotNull(ChatResource.class.getMethod("listSessions"));
    }

    /**
     * 置顶/重命名端点在位性 (Task 8): 形状契约由真库集成测试钉死, 此处只钉方法签名与 DTO 依赖 —
     * 路径注解驱动的路由 404 形态由 {@code ChatSessionManageTest} 以真实 HTTP 面覆盖.
     * @since 1.9.0
     */
    @Test void methods_PinAndRenameExist() throws Exception
    {
        assertNotNull(ChatResource.class.getMethod("pinSession", String.class));
        assertNotNull(ChatResource.class.getMethod("renameSession", String.class, kurvcygnus.soulnotes.domain.chat.dto.SessionRenameRequest.class));
    }
}
