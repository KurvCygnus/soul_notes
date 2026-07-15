package kurvcygnus.soulnotes.domain.diary.dto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link DiaryListQuery} 的单元测试</b>
 * <p>验证分页参数计算与日期范围设置.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class DiaryListQueryTest
{
    @Test void defaultValues_ShouldBeJavaDefaults()
    {
        final var query = new DiaryListQuery();
        //* @DefaultValue 仅在 JAX-RS 容器中生效, 直接 new 时字段为 Java 默认值 0.
        assertEquals(0, query.getPage());
        assertEquals(0, query.getSize());
        assertEquals(0, query.getOffset());
    }

    @Test void offsetCalculation_ShouldWorkCorrectly()
    {
        final var query = new DiaryListQuery();
        query.setPage(2);
        query.setSize(15);
        assertEquals(15, query.getOffset());
    }

    @Test void negativePage_ShouldClampToOne()
    {
        //* page 最小为 1, 负数应 clamp 到 1, offset 应为 0.
        final var query = new DiaryListQuery();
        query.setPage(-1);
        query.setSize(20);
        assertEquals(1, query.getPage());
        assertEquals(0, query.getOffset());
    }

    @Test void zeroSize_ShouldProduceOffsetZero()
    {
        final var query = new DiaryListQuery();
        query.setPage(1);
        query.setSize(0);
        //* size 被 clamp 到 1, offset = (1-1)*1 = 0.
        assertEquals(1, query.getSize());
        assertEquals(0, query.getOffset());
    }

    @Test void dateRange_ShouldBeSettable()
    {
        final var query = new DiaryListQuery();
        query.setStartDate("2026-01-01");
        query.setEndDate("2026-06-19");
        assertEquals("2026-01-01", query.getStartDate());
        assertEquals("2026-06-19", query.getEndDate());
    }

    @Test void dateRange_WithNull_ShouldBeAccepted()
    {
        final var query = new DiaryListQuery();
        query.setStartDate(null);
        query.setEndDate(null);
        assertNull(query.getStartDate());
        assertNull(query.getEndDate());
    }
}