package kurvcygnus.soulnotes.domain.context;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.PipelineUsers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.util.List;

import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@code GET /api/v1/context/summary} 契约集成测试</b> (真库).
 * <p>默认 {@code ai.domain.adapter=none} 下必须回 {@code code=0} 外壳且三数组 (schedule/exams/agenda)
 * 为空数组 — 是前端情境卡"藏区"判空的数据契约. 结构断言在 {@code ContextResourceTest} (纯 JUnit) 分置.</p>
 * <p>复用 {@link MockLlmProfile} 既有真库装配 (项目内唯一 @QuarkusTest 真库 Profile,
 * 与 {@code DiaryListContractTest} 同款取舍), 登录走 {@link PipelineUsers} 注册脚手架.</p>
 * @since 1.5.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过情境聚合契约真库用例")
class ContextResourceContractTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    //* 字面量钉死线上路径, 与 ApiEndpointConstants 解耦: 常量漂移时由本用例兜底暴露.
    @Test void summary_DefaultAdapterNone_ShouldReturnEnvelopeWithThreeEmptyArrays()
    {
        final var account = PipelineUsers.register();

        final var body = RestAssured.
            given().
            header("Authorization", PipelineUsers.bearer(account.token())).
            when().
            get("/api/v1/context/summary").
            then().
            statusCode(200).
            body("code", equalTo(0)).
            body("message", equalTo("success")).
            extract().jsonPath();

        //* adapter=none: 三处必须是"空数组"而非 null/键缺席 — 前端按 size 判空隐藏"你的情境"区, null 会炸渲染.
        final var schedule = body.<List<?>>get("data.schedule");
        final var exams    = body.<List<?>>get("data.exams");
        final var agenda   = body.<List<?>>get("data.agenda");
        assertNotNull(schedule, "data.schedule 必须为空数组而非缺席");
        assertNotNull(exams, "data.exams 必须为空数组而非缺席");
        assertNotNull(agenda, "data.agenda 必须为空数组而非缺席");
        assertEquals(0, schedule.size(), "adapter=none 时 schedule 应为空数组");
        assertEquals(0, exams.size(), "adapter=none 时 exams 应为空数组");
        assertEquals(0, agenda.size(), "adapter=none 时 agenda 应为空数组");
    }
}
