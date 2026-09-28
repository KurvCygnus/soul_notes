package kurvcygnus.soulnotes.domain.context;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 模拟校园数据源单元测试: 考试倒计时锚定/withinDays 过滤/课表星期语义/日程种子.
 * <p>纯单元测试, 不启 Quarkus, 不触库 — 日期均在调用时锚定, 无需注入时钟.</p>
 * @since 1.5.0
 */
class SimulatedCampusAdapterTest
{
    private final SimulatedCampusAdapter adapter = new SimulatedCampusAdapter();

    //* 倒计时不变量: 高数期中考恒为调用日 +6 天 (演示锚定契约).
    @Test void upcomingExams_FirstExamIsSixDaysAway()
    {
        final var exams = adapter.upcomingExams(UUID.randomUUID(), 30).await().indefinitely();
        assertEquals(3, exams.size());
        assertEquals("高等数学期中考", exams.getFirst().name());
        assertEquals(6, exams.getFirst().daysUntil());
        assertEquals(13, exams.get(1).daysUntil());
        assertEquals(20, exams.get(2).daysUntil());
    }

    //* withinDays 过滤语义.
    @Test void upcomingExams_WithinSevenDays_OnlyFirst()
    {
        assertEquals(1, adapter.upcomingExams(UUID.randomUUID(), 7).await().indefinitely().size());
    }

    //* 工作日 4 节课, 周末 0 节; 测试缝与公网入口一致.
    @Test void todaySchedule_WeekdayFourWeekendZero()
    {
        assertEquals(4, adapter.todaySchedule(DayOfWeek.MONDAY).size());
        assertEquals(0, adapter.todaySchedule(DayOfWeek.SUNDAY).size());
    }

    @Test void recentAgenda_ReturnsThreeItems()
    {
        assertEquals(3, adapter.recentAgenda(UUID.randomUUID(), 30).await().indefinitely().size());
    }
}
