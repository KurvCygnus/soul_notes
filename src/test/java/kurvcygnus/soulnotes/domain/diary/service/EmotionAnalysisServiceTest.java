package kurvcygnus.soulnotes.domain.diary.service;

import kurvcygnus.soulnotes.ai.dto.MoodAnalysisResult;
import kurvcygnus.soulnotes.ai.dto.WarningDetectionResult;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link EmotionAnalysisService} 单元测试</b>
 * <p>通过反射测试私有静态方法 {@code mergeResults} 的 JSON 合并逻辑.</p>
 *
 * @author Claude Code
 * @since 2.0
 */
class EmotionAnalysisServiceTest
{
    private static String invokeMergeResults(MoodAnalysisResult mood, WarningDetectionResult warning) throws Exception
    {
        final var method = EmotionAnalysisService.class.getDeclaredMethod("mergeResults",
            MoodAnalysisResult.class, WarningDetectionResult.class);
        method.setAccessible(true);
        return (String) method.invoke(null, mood, warning);
    }

    @Test void mergeResults_ShouldReturnValidJson() throws Exception
    {
        final var mood = new MoodAnalysisResult(0.7, 0.2, 0.1, "sunny", "今天心情不错");
        final var warning = new WarningDetectionResult("NONE", "", "");
        final var json = invokeMergeResults(mood, warning);

        assertNotNull(json);
        assertTrue(json.startsWith("{"));
        assertTrue(json.endsWith("}"));
    }

    @Test void mergeResults_ShouldContainAllFields() throws Exception
    {
        final var mood = new MoodAnalysisResult(0.5, 0.3, 0.2, "cloudy", "一般");
        final var warning = new WarningDetectionResult("YELLOW", "some reason", "some action");
        final var json = invokeMergeResults(mood, warning);

        assertTrue(json.contains("\"positive\""));
        assertTrue(json.contains("\"negative\""));
        assertTrue(json.contains("\"anxiety\""));
        assertTrue(json.contains("\"weather\""));
        assertTrue(json.contains("\"summary\""));
        assertTrue(json.contains("\"warningLevel\""));
        assertTrue(json.contains("\"warningReason\""));
        assertTrue(json.contains("\"suggestedAction\""));
    }

    @Test void mergeResults_ShouldPreserveValues() throws Exception
    {
        final var mood = new MoodAnalysisResult(0.8, 0.1, 0.05, "sunny", "很棒的一天");
        final var warning = new WarningDetectionResult("NONE", "", "无需干预");
        final var json = invokeMergeResults(mood, warning);

        assertTrue(json.contains("\"positive\":0.8") || json.contains("\"positive\":0.80"));
        assertTrue(json.contains("\"weather\":\"sunny\""));
        assertTrue(json.contains("\"summary\":\"很棒的一天\""));
        assertTrue(json.contains("\"warningLevel\":\"NONE\""));
    }

    @Test void mergeResults_AllExtremeValues() throws Exception
    {
        final var mood = new MoodAnalysisResult(1.0, 1.0, 1.0, "thunderstorm", "非常糟糕");
        final var warning = new WarningDetectionResult("RED", "极端情绪", "立即干预");
        final var json = invokeMergeResults(mood, warning);

        assertTrue(json.contains("\"positive\":1.0") || json.contains("\"positive\":1"));
        assertTrue(json.contains("\"warningLevel\":\"RED\""));
        assertTrue(json.contains("\"suggestedAction\":\"立即干预\""));
    }

    @Test void mergeResults_EmptySummary() throws Exception
    {
        final var mood = new MoodAnalysisResult(0.5, 0.5, 0.5, "rainy", "");
        final var warning = new WarningDetectionResult("YELLOW", "test", "test");
        final var json = invokeMergeResults(mood, warning);

        assertTrue(json.contains("\"summary\":\"\""));
    }
}
