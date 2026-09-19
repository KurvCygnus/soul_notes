package kurvcygnus.soulnotes.domain.clinical.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kurvcygnus.soulnotes.utils.JsonUtils;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>ClinicalAssessmentService 纯逻辑单测</b>: NONE 跳过 / VO 映射 (真库查询由 @QuarkusTest 覆盖).
 * @since 1.2.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
class ClinicalAssessmentServiceTest
{
    @BeforeAll
    @SuppressWarnings("InstantiationOfUtilityClass")//! JsonUtils 为 final 全静态成员类, IDE 误报实例化; 构造器正是 CDI 桥接注入入口.
    static void initMapper()
    {
        //* 纯单元测试无 CDI 容器, 手动构造 mapper (brief 测试代码缺此初始化, 依项目测试惯例补齐).
        new JsonUtils(new ObjectMapper());
    }

    private final ClinicalAssessmentService service = new ClinicalAssessmentService("RED", new StubHub());

    @BeforeEach void resetProbe()
    {
        //* 跨测试复位静态探针: 同 JVM 内真库用例 (@QuarkusTest) 先跑并 persist 时, NONE 用例不再被残留值误伤.
        ClinicalAssessmentService.lastPersistedId = null;
    }

    @Test void recordAsync_SkipsNoneWithoutTouchingDb()
    {
        var payload = JsonUtils.parseJson("{\"riskLevel\":\"NONE\",\"tags\":[],\"summary\":\"x\"}", JsonNode.class);
        service.recordAsync(UUID.randomUUID(), UUID.randomUUID(), payload, null).
            await().atMost(java.time.Duration.ofSeconds(5));
        assertNull(ClinicalAssessmentService.lastPersistedId, "NONE 不得触碰数据库");
    }

    @Test void summaryExtraction_ToleratesMissingField()
    {
        var payload = JsonUtils.parseJson("{\"riskLevel\":\"YELLOW\"}", JsonNode.class);
        assertEquals("", ClinicalAssessmentService.extractSummary(payload), "canonical summary 缺失 → 空串不抛");
        var full = JsonUtils.parseJson("{\"riskLevel\":\"RED\",\"summary\":\"关注\"}", JsonNode.class);
        assertEquals("关注", ClinicalAssessmentService.extractSummary(full));
    }

    //* StubHub: 空操作广播替身, 隔离 WS 依赖.
    static final class StubHub extends kurvcygnus.soulnotes.websocket.ClinicalFeedHub
    {
        StubHub() { }
        @Override public io.smallrye.mutiny.Uni<Void> broadcast(String json) { return io.smallrye.mutiny.Uni.createFrom().voidItem(); }
    }
}
