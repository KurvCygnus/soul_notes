package kurvcygnus.soulnotes.domain.diary.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link DiaryService} 结构验证测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class DiaryServiceTest
{
    @Test void class_ShouldBePublicAndFinal()
    {
        assertTrue(Modifier.isPublic(DiaryService.class.getModifiers()));
        assertTrue(Modifier.isFinal(DiaryService.class.getModifiers()));
    }

    @Test void constructor_ShouldAcceptServices()
    {
        final var ctors = DiaryService.class.getDeclaredConstructors();
        assertEquals(1, ctors.length);
        final var paramTypes = ctors[0].getParameterTypes();
        assertEquals(2, paramTypes.length);
        assertEquals(EmotionAnalysisService.class, paramTypes[0]);
        assertEquals(kurvcygnus.soulnotes.domain.voice.service.VoiceStorageService.class, paramTypes[1]);
    }
}
