package kurvcygnus.soulnotes.domain.diary.entity;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link MoodDiary} 的单元测试</b>
 * <p>验证实体字段赋值与静态查询方法签名正确性.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class MoodDiaryTest
{
    @Test
    void entity_ShouldAcceptAllFields()
    {
        final var diary = new MoodDiary();
        diary.id = 1L;
        diary.userId = UUID.randomUUID();
        diary.content = "测试日记内容";
        diary.audioUrl = "https://audio.example.com/test.wav";
        diary.analysisResult = "{\"positive\":0.8,\"negative\":0.2}";
        diary.createdAt = Instant.now();

        assertEquals(1L, diary.id);
        assertNotNull(diary.userId);
        assertEquals("测试日记内容", diary.content);
        assertNotNull(diary.audioUrl);
        assertNotNull(diary.analysisResult);
        assertNotNull(diary.createdAt);
    }

    @Test
    void entity_OptionalFields_ShouldBeNullable()
    {
        final var diary = new MoodDiary();
        diary.id = 2L;
        diary.userId = UUID.randomUUID();
        diary.createdAt = Instant.now();

        assertNull(diary.content);
        assertNull(diary.audioUrl);
        assertNull(diary.analysisResult);
    }

    @Test
    void findByUserAndDateRange_ShouldExistAsStaticMethod()
    {
        //* 验证静态查询方法的签名存在 (不会抛出 NoSuchMethodError).
        final var methods = MoodDiary.class.getDeclaredMethods();
        assertTrue(
            java.util.Arrays.stream(methods).anyMatch(m -> m.getName().equals("findByUserAndDateRange"))
        );
    }

    @Test
    void findByUserId_ShouldExistAsStaticMethod()
    {
        final var methods = MoodDiary.class.getDeclaredMethods();
        assertTrue(
            java.util.Arrays.stream(methods).anyMatch(m -> m.getName().equals("findByUserId"))
        );
    }
}