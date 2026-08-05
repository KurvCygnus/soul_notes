package kurvcygnus.soulnotes.domain.voice.service;

import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.utils.enums.VoiceStatus;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link AsrTranscriptionService} 结构单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class AsrTranscriptionServiceTest
{
    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(AsrTranscriptionService.class.getModifiers()));
    }

    @Test void class_ShouldBeApplicationScoped()
    {
        assertTrue(AsrTranscriptionService.class.isAnnotationPresent(ApplicationScoped.class));
    }

    @Test void methods_DispatchAndHandleExist() throws Exception
    {
        assertNotNull(AsrTranscriptionService.class.getMethod("dispatchTranscription", String.class, String.class));
        assertNotNull(AsrTranscriptionService.class.getMethod("handleResult", String.class, String.class, VoiceStatus.class));
    }
}
