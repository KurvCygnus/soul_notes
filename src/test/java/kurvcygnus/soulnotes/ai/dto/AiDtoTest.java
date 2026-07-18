package kurvcygnus.soulnotes.ai.dto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link MoodAnalysisResult} 与 {@link WarningDetectionResult} DTO 单元测试</b>
 *
 * @author Claude Code
 * @since 2.0
 */
class AiDtoTest
{
    //region MoodAnalysisResult

    @Test void moodAnalysis_ShouldConstructAndReadAllFields()
    {
        final var result = new MoodAnalysisResult(0.7, 0.2, 0.1, "sunny", "今天心情不错");
        assertEquals(0.7, result.positive());
        assertEquals(0.2, result.negative());
        assertEquals(0.1, result.anxiety());
        assertEquals("sunny", result.weather());
        assertEquals("今天心情不错", result.summary());
    }

    @Test void moodAnalysis_ZeroValues_ShouldBeValid()
    {
        final var result = new MoodAnalysisResult(0.0, 0.0, 0.0, "sunny", "");
        assertEquals(0.0, result.positive());
        assertNotNull(result.summary());
    }

    @Test void moodAnalysis_MaxValues_ShouldBeValid()
    {
        final var result = new MoodAnalysisResult(1.0, 1.0, 1.0, "thunderstorm", "非常糟糕");
        assertEquals(1.0, result.positive());
        assertEquals(1.0, result.negative());
        assertEquals(1.0, result.anxiety());
    }

    @Test void moodAnalysis_WeatherAllTypes_ShouldBeAccessible()
    {
        assertDoesNotThrow(() -> new MoodAnalysisResult(0.5, 0.3, 0.2, "sunny", ""));
        assertDoesNotThrow(() -> new MoodAnalysisResult(0.5, 0.3, 0.2, "cloudy", ""));
        assertDoesNotThrow(() -> new MoodAnalysisResult(0.5, 0.3, 0.2, "overcast", ""));
        assertDoesNotThrow(() -> new MoodAnalysisResult(0.5, 0.3, 0.2, "rainy", ""));
        assertDoesNotThrow(() -> new MoodAnalysisResult(0.5, 0.3, 0.2, "thunderstorm", ""));
    }

    @Test void moodAnalysis_EqualsAndHashCode()
    {
        final var a = new MoodAnalysisResult(0.5, 0.3, 0.2, "cloudy", "一般");
        final var b = new MoodAnalysisResult(0.5, 0.3, 0.2, "cloudy", "一般");
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    //endregion

    //region WarningDetectionResult

    @Test void warningDetection_ShouldConstructAndReadAllFields()
    {
        final var result = new WarningDetectionResult("NONE", "", "");
        assertEquals("NONE", result.warningLevel());
        assertEquals("", result.reason());
        assertEquals("", result.suggestedAction());
    }

    @Test void warningDetection_YellowAlert()
    {
        final var result = new WarningDetectionResult("YELLOW", "中度焦虑", "建议联系心理咨询中心");
        assertEquals("YELLOW", result.warningLevel());
        assertEquals("中度焦虑", result.reason());
        assertEquals("建议联系心理咨询中心", result.suggestedAction());
    }

    @Test void warningDetection_RedAlert()
    {
        final var result = new WarningDetectionResult("RED", "自我伤害倾向", "立即拨打心理援助热线: 400-161-9995");
        assertEquals("RED", result.warningLevel());
        assertTrue(result.reason().contains("自我伤害"));
        assertTrue(result.suggestedAction().contains("400"));
    }

    @Test void warningDetection_EqualsAndHashCode()
    {
        final var a = new WarningDetectionResult("RED", "危机", "干预");
        final var b = new WarningDetectionResult("RED", "危机", "干预");
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    //endregion
}
