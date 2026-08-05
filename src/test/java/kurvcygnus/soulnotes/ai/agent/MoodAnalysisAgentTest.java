package kurvcygnus.soulnotes.ai.agent;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import kurvcygnus.soulnotes.ai.dto.MoodAnalysisResult;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link MoodAnalysisAgent} 接口签名验证</b>
 *
 * @author Claude Code
 * @since 2.0
 */
class MoodAnalysisAgentTest
{
    @Test void interface_ShouldBeAnnotatedWithRegisterAiService()
    {
        assertTrue(MoodAnalysisAgent.class.isAnnotationPresent(RegisterAiService.class));
    }

    @Test void method_analyze_ShouldHaveCorrectSignature() throws Exception
    {
        final var method = MoodAnalysisAgent.class.getDeclaredMethod("analyze", String.class);
        assertNotNull(method);
        assertEquals(MoodAnalysisResult.class, method.getReturnType());
        assertTrue(method.isAnnotationPresent(SystemMessage.class));
        assertTrue(method.isAnnotationPresent(UserMessage.class));
    }

    @Test void method_analyze_ShouldHaveVAnnotation() throws Exception
    {
        final var method = MoodAnalysisAgent.class.getDeclaredMethod("analyze", String.class);
        final var params = method.getParameters();
        assertEquals(1, params.length);
        assertTrue(params[0].isAnnotationPresent(V.class));
        assertEquals("content", params[0].getAnnotation(V.class).value());
    }
}
