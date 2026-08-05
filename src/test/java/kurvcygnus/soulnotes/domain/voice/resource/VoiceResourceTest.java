package kurvcygnus.soulnotes.domain.voice.resource;

import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.Path;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link VoiceResource} 结构单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class VoiceResourceTest
{
    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(VoiceResource.class.getModifiers()));
    }

    @Test void class_ShouldHavePathAnnotation()
    {
        final var path = VoiceResource.class.getAnnotation(Path.class);
        assertNotNull(path);
        assertEquals(ApiEndpointConstants.VOICE_BASE, path.value());
    }

    @Test void class_ShouldHaveRolesAllowed()
    {
        assertTrue(VoiceResource.class.isAnnotationPresent(RolesAllowed.class));
    }

    @Test void methods_UploadAndCallbackExist() throws Exception
    {
        assertNotNull(VoiceResource.class.getMethod("upload", org.jboss.resteasy.reactive.multipart.FileUpload.class));
        assertNotNull(VoiceResource.class.getMethod("handleAsrCallback", kurvcygnus.soulnotes.domain.voice.dto.AsrCallbackRequest.class));
    }
}
