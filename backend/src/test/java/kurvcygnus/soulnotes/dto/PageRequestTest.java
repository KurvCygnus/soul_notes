package kurvcygnus.soulnotes.dto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link PageRequest} 的单元测试</b>
 * <p>重点验证 OFFSET 计算正确性与边界情况.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class PageRequestTest
{
    @Test void defaultValues_ShouldBeJavaDefaults()
    {
        final var pr = new PageRequest();
        //* @DefaultValue 仅在 JAX-RS 容器中生效, 直接 new 时字段为 Java 默认值 0.
        assertEquals(0, pr.getPage());
        assertEquals(0, pr.getSize());
        assertEquals(0, pr.getOffset());
    }

    @Test void offsetCalculation_ShouldWorkCorrectly()
    {
        final var pr = new PageRequest();
        pr.setPage(1);
        pr.setSize(10);
        assertEquals(0, pr.getOffset());

        pr.setPage(2);
        assertEquals(10, pr.getOffset());

        pr.setPage(3);
        assertEquals(20, pr.getOffset());
    }

    @Test void offsetWithNonStandardSize_ShouldCalculateCorrectly()
    {
        final var pr = new PageRequest();
        pr.setPage(5);
        pr.setSize(50);
        assertEquals(200, pr.getOffset());
    }

    @Test void negativePage_ShouldClampToOne()
    {
        //* page 最小为 1, 负数应 clamp 到 1, offset 应为 0.
        final var pr = new PageRequest();
        pr.setPage(-1);
        assertEquals(1, pr.getPage());
        assertEquals(0, pr.getOffset());
    }

    @Test void zeroSize_ShouldClampToOne()
    {
        final var pr = new PageRequest();
        pr.setPage(1);
        pr.setSize(0);
        //* size 被 clamp 到 1, offset = (1-1)*1 = 0.
        assertEquals(1, pr.getSize());
        assertEquals(0, pr.getOffset());
    }

    @Test void pageOneSizeOne_ShouldHaveOffsetZero()
    {
        final var pr = new PageRequest();
        pr.setPage(1);
        pr.setSize(1);
        assertEquals(0, pr.getOffset());
    }
}