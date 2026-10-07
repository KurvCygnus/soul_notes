package kurvcygnus.soulnotes.domain.extension.builtin;

import kurvcygnus.soulnotes.domain.extension.DomainItems.ScheduleItem;
import kurvcygnus.soulnotes.domain.extension.ISchemaNode;
import kurvcygnus.soulnotes.domain.extension.LLMToolSpec;
import kurvcygnus.soulnotes.utils.TimeUtils;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>内置 campus 演示扩展测试</b> (Task 4): 三扩展的 name/command/argsType 契约, query 演示数据形态
 * (+6 天考试 / +2 天日程锚点), withinDays 窗口过滤与空参数树形态.
 * <p>测试域直接 new 扩展 (免容器); timetable 按星期取数, 周末恒空集 —
 * 非空断言锚定星期缝 (周一), 不锚定运行日, 免日期敏感假失败.</p>
 *
 * @author Claude Code
 * @since 1.7.0
 */
class BuiltinExtensionsTest
{
    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private static final NoArgs NO_ARGS = new NoArgs();

    @Test void timetable_Metadata_ShouldMatchContract()
    {
        final var extension = new TimetableExtension();
        assertEquals("timetable", extension.name());
        assertEquals(NoArgs.class, extension.argsType());
        final var spec = extension.aiCallCommand();
        assertEquals("query_timetable", spec.command());
        assertEquals("查询学生今日课表", spec.description());
        assertEquals("正在查询课表…", extension.toolCallLabel()); //* 工具调用可见性: label 为扩展自定义.
    }

    @Test void timetable_Query_ShouldReturnTodaySchedule()
    {
        final var result = new TimetableExtension().query(USER_ID, NO_ARGS);
        assertNotNull(result);
        assertEquals(DemoCampusData.timetable(LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI).getDayOfWeek()), result);
        //* 周末无课 (getOrDefault 空集) — 非空锚定在周一缝, 演示数据恒定.
        final var monday = DemoCampusData.timetable(DayOfWeek.MONDAY);
        assertFalse(monday.isEmpty());
        assertEquals(new ScheduleItem("高等数学", "08:00-09:40", "一教 302"), monday.getFirst());
    }

    @Test void exams_Metadata_ShouldMatchContract()
    {
        final var extension = new ExamsExtension();
        assertEquals("exams", extension.name());
        assertEquals(NoArgs.class, extension.argsType());
        final var spec = extension.aiCallCommand();
        assertEquals("query_exams", spec.command());
        assertEquals("查询学生近期考试安排 (两周内)", spec.description());
        assertEquals("正在查询考试安排…", extension.toolCallLabel());
    }

    @Test void exams_Query_ShouldReturnFourteenDayWindow()
    {
        final var exams = new ExamsExtension().query(USER_ID, NO_ARGS);
        assertFalse(exams.isEmpty());
        assertTrue(exams.stream().anyMatch(e -> e.daysUntil() == 6));  //* "+6 天" 锚定条目
        assertTrue(exams.stream().allMatch(e -> e.daysUntil() <= 14)); //* +20 天条目必须被窗口挡住
    }

    @Test void exams_ShouldFilterByWithinDays()
    {
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI);
        assertTrue(DemoCampusData.exams(today, 1).isEmpty());
    }

    @Test void agenda_Metadata_ShouldMatchContract()
    {
        final var extension = new AgendaExtension();
        assertEquals("agenda", extension.name());
        assertEquals(NoArgs.class, extension.argsType());
        final var spec = extension.aiCallCommand();
        assertEquals("query_agenda", spec.command());
        assertEquals("查询学生近期日程安排 (两周内)", spec.description());
        assertEquals("正在查询日程…", extension.toolCallLabel());
    }

    @Test void agenda_Query_ShouldReturnFourteenDayWindow()
    {
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI);
        final var agenda = new AgendaExtension().query(USER_ID, NO_ARGS);
        assertFalse(agenda.isEmpty());
        assertTrue(agenda.stream().anyMatch(a -> ChronoUnit.DAYS.between(today, a.date()) == 2)); //* "+2 天" 锚定条目
        assertTrue(agenda.stream().noneMatch(a -> a.date().isAfter(today.plusDays(14))));         //* 窗口外不漏
    }

    @Test void agenda_ShouldFilterByWithinDays()
    {
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI);
        assertTrue(DemoCampusData.agenda(today, 1).isEmpty());
    }

    @Test void aiCallCommand_Parameters_ShouldBeEmptyObjectNode()
    {
        assertEmptyObjectSchema(new TimetableExtension().aiCallCommand());
        assertEmptyObjectSchema(new ExamsExtension().aiCallCommand());
        assertEmptyObjectSchema(new AgendaExtension().aiCallCommand());
    }

    //region P3 Task 1: 情境贡献与通知规则 (课表扩展; 固定星期/时刻缝, 不锚定运行时刻)
    @Test void timetable_AiContextContribution_TeachingDay_ShouldCarrySchedule()
    {
        final var contribution = new TimetableExtension().aiContextContribution(USER_ID, DayOfWeek.MONDAY);
        final var text = contribution.await().atMost(java.time.Duration.ofSeconds(2));
        assertNotNull(text, "有课日的课表贡献必须在场");
        assertTrue(text.contains("今日课表:"), text);
        assertTrue(text.contains("高等数学") && text.contains("一教 302"), text);
    }

    @Test void timetable_AiContextContribution_EmptyDay_ShouldContributeNothing()
    {
        final var contribution = new TimetableExtension().aiContextContribution(USER_ID, DayOfWeek.SUNDAY);
        //* 无贡献语义: null Uni 或 null 项均可 (框架侧均按 "不注入" 归一).
        assertTrue(contribution == null || contribution.await().atMost(java.time.Duration.ofSeconds(2)) == null,
            "周末无课日贡献必须为空");
    }

    @Test void timetable_NotificationRules_InWindow_ShouldCarryFifteenMinuteBeforeRules()
    {
        //* 周一 4 节课, 07:50 落在首节课 (08:00) 的 "前 15 分钟" 窗口内: 恰好 1 条到期规则.
        final var rules = new TimetableExtension().notificationRules(USER_ID, DayOfWeek.MONDAY, java.time.LocalTime.of(7, 50)).
            await().atMost(java.time.Duration.ofSeconds(2));
        assertEquals(1, rules.size(), rules.toString());
        final var rule = rules.getFirst();
        assertEquals("class", rule.type());
        assertEquals("即将上课", rule.title());
        assertEquals(-15, rule.minutesOffset());
        assertTrue(rule.bodyTemplate().contains("高等数学"), rule.bodyTemplate());
        assertTrue(rule.bodyTemplate().contains("一教 302"), rule.bodyTemplate());
        assertFalse(rule.id().isBlank(), "规则 ID 必须非空 (幂等键组成部分)");
    }

    @Test void timetable_NotificationRules_WindowBoundaries_ShouldBeInclusiveBeforeAndExclusiveAtStart()
    {
        final var extension = new TimetableExtension();
        final var atNotifyMoment = extension.notificationRules(USER_ID, DayOfWeek.MONDAY, java.time.LocalTime.of(7, 45)).
            await().atMost(java.time.Duration.ofSeconds(2));
        assertEquals(1, atNotifyMoment.size(), "开窗时刻 (上课前 15 分钟整) 必须在场");
        final var atClassStart = extension.notificationRules(USER_ID, DayOfWeek.MONDAY, java.time.LocalTime.of(8, 0)).
            await().atMost(java.time.Duration.ofSeconds(2));
        assertTrue(atClassStart.isEmpty(), "开课时刻必须出窗 (迟到补推无意义)");
        final var earlyMorning = extension.notificationRules(USER_ID, DayOfWeek.MONDAY, java.time.LocalTime.of(6, 0)).
            await().atMost(java.time.Duration.ofSeconds(2));
        assertTrue(earlyMorning.isEmpty(), "窗口前不得提前下发");
    }

    @Test void timetable_NotificationRules_SpiDefault_ShouldReturnEmptyUni()
    {
        //* 未覆写默认方法的扩展 (exams/agenda) 恒无到期规则 — 调度器空转跳过.
        final var rules = new ExamsExtension().notificationRules(USER_ID).await().atMost(java.time.Duration.ofSeconds(2));
        assertTrue(rules.isEmpty());
    }
    //endregion

    //* 参数树形态断言缝: 三扩展的 LLM 契约均为空对象 (无参查询) — helper 规避可空值入 List.of.
    private static void assertEmptyObjectSchema(LLMToolSpec spec)
    {
        final var parameters = assertInstanceOf(ISchemaNode.ObjectNode.class, spec.parameters());
        assertTrue(parameters.properties().isEmpty());
        assertTrue(parameters.required().isEmpty());
    }
}
