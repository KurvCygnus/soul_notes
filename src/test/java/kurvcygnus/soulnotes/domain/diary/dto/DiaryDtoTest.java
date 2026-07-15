package kurvcygnus.soulnotes.domain.diary.dto;

import kurvcygnus.soulnotes.domain.diary.dto.DiaryCreateRequest.SourceType;
import kurvcygnus.soulnotes.utils.enums.EmotionWeatherType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>日记模块 DTO 单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class DiaryDtoTest
{
    @Test void diaryCreateRequest_TextSource_ShouldStoreContent()
    {
        final var req = new DiaryCreateRequest("今天心情不错", null, SourceType.TEXT);
        assertEquals("今天心情不错", req.content());
        assertNull(req.audioData());
        assertEquals(SourceType.TEXT, req.sourceType());
    }

    @Test void diaryCreateRequest_VoiceSource_ShouldStoreAudioData()
    {
        final var req = new DiaryCreateRequest(null, "base64encoded", SourceType.VOICE);
        assertNull(req.content());
        assertEquals("base64encoded", req.audioData());
    }

    //! @NotNull 注解在运行时不进行空值校验, 因此不测试 null 参数构造.

    @Test void diaryListQuery_DefaultValues()
    {
        final var query = new DiaryListQuery();
        //* @DefaultValue 仅在 JAX-RS 容器中生效, 直接 new 时字段为 Java 默认值 (0 / null).
        assertEquals(0, query.getPage());
        assertEquals(0, query.getSize());
        assertEquals(0, query.getOffset());
        assertNull(query.getStartDate());
        assertNull(query.getEndDate());
    }

    @Test void diaryListQuery_WithDateRange()
    {
        final var query = new DiaryListQuery();
        query.setPage(1);
        query.setSize(10);
        query.setStartDate("2026-01-01");
        query.setEndDate("2026-06-19");
        assertEquals("2026-01-01", query.getStartDate());
        assertEquals("2026-06-19", query.getEndDate());
        assertEquals(0, query.getOffset());
    }

    @Test void emotionWeatherVo_ShouldStoreAllFields()
    {
        final var date = LocalDate.of(2026, 6, 19);
        final var vo = new EmotionWeatherVo(date, EmotionWeatherType.SUNNY, 0.8, 0.2, 0.1, 3);
        assertEquals(date, vo.date());
        assertEquals(EmotionWeatherType.SUNNY, vo.weatherType());
        assertEquals(0.8, vo.positiveAvg(), 0.001);
        assertEquals(0.2, vo.negativeAvg(), 0.001);
        assertEquals(0.1, vo.anxietyAvg(), 0.001);
        assertEquals(3, vo.entryCount());
    }

    @Test void emotionWeatherVo_WithNegativeValues()
    {
        final var vo = new EmotionWeatherVo(
            LocalDate.now(), EmotionWeatherType.THUNDERSTORM, 0.1, 0.9, 0.95, 1
        );
        assertEquals(0.95, vo.anxietyAvg(), 0.001);
    }

    @Test void diaryResponse_WithoutAnalysisResult_ShouldHandleNull()
    {
        final var now = Instant.now();
        final var resp = new DiaryResponse(
            1L, UUID.randomUUID(), "content", null, null, now
        );
        assertEquals("content", resp.content());
        assertNull(resp.analysisResult());
        assertNull(resp.audioUrl());
    }

    @Test void diaryResponse_AnalysisResultDto_ShouldStoreCorrectly()
    {
        final var analysis = new DiaryResponse.OfAnalysisResult(
            0.8, 0.2, 0.1, "sunny", "NONE", "今天心情不错"
        );
        assertEquals(0.8, analysis.positive());
        assertEquals("NONE", analysis.warningLevel());
        assertEquals("今天心情不错", analysis.summary());
    }
}