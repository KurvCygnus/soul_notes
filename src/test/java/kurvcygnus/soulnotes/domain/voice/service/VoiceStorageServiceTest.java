package kurvcygnus.soulnotes.domain.voice.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link VoiceStorageService} 结构单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class VoiceStorageServiceTest
{
    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(VoiceStorageService.class.getModifiers()));
    }

    @Test void class_ShouldBeApplicationScoped()
    {
        assertTrue(VoiceStorageService.class.isAnnotationPresent(ApplicationScoped.class));
    }

    @Test void methods_StoreAndDeleteExist() throws Exception
    {
        assertNotNull(VoiceStorageService.class.getMethod("store", String.class, java.io.InputStream.class));
        assertNotNull(VoiceStorageService.class.getMethod("delete", String.class));
    }

    @Test void constructor_TakesStringParam() throws Exception
    {
        final var constructor = VoiceStorageService.class.getDeclaredConstructor(String.class);
        assertNotNull(constructor);
    }
}
