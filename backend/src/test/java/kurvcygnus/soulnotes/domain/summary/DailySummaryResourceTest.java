package kurvcygnus.soulnotes.domain.summary;

import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import kurvcygnus.soulnotes.domain.summary.dto.DailySummaryVo;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.LocalDate;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link DailySummaryResource} 结构单元测试</b> (纯 JUnit, 不启 Quarkus — 资源结构断言惯例).
 * <p>final 断言须在 Quarkus 增强外执行 (ArC 子类化会剥除 ACC_FINAL), 契约集成测试分置
 * {@code DailySummaryResourceContractTest}.</p>
 * @since 1.5.0
 */
class DailySummaryResourceTest
{
    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(DailySummaryResource.class.getModifiers()));
    }

    //* 路径常量即前端契约: 同时钉死常量引用与字面量, 常量漂移由字面量断言兜底暴露.
    @Test void class_ShouldHavePathAnnotation()
    {
        final var path = DailySummaryResource.class.getAnnotation(Path.class);
        assertNotNull(path, "DailySummaryResource 必须挂 @Path");
        assertEquals(ApiEndpointConstants.SUMMARY_BASE, path.value());
        assertEquals("/api/v1/summary", path.value());
    }

    //* 角色门禁必须真实在场: 仅注解在场但不含 STUDENT 一样把学生挡在门外, 故同时断言值.
    @Test void class_ShouldHaveRolesAllowedContainingStudent()
    {
        final var roles = DailySummaryResource.class.getAnnotation(RolesAllowed.class);
        assertNotNull(roles);
        assertTrue(Arrays.asList(roles.value()).contains(UserRole.ROLE_STUDENT), "@RolesAllowed 必须含 STUDENT");
    }

    @Test void method_Daily_ShouldBeGetEndpoint() throws Exception
    {
        final Method daily = DailySummaryResource.class.getMethod("daily");
        assertNotNull(daily.getAnnotation(GET.class), "daily() 必须为 GET 端点");
    }

    @Test void method_Recent_ShouldBeGetEndpointWithDefaultLimit() throws Exception
    {
        final Method recent = DailySummaryResource.class.getMethod("recent", int.class);
        assertNotNull(recent.getAnnotation(GET.class), "recent() 必须为 GET 端点");
        final var limit = recent.getParameters()[0];
        final var queryParam = limit.getAnnotation(QueryParam.class);
        assertNotNull(queryParam, "limit 参数必须经 @QueryParam 注入");
        assertEquals("limit", queryParam.value());
        final var defaultValue = limit.getAnnotation(DefaultValue.class);
        assertNotNull(defaultValue, "limit 参数必须带 @DefaultValue (缺省 7)");
        assertEquals("7", defaultValue.value());
    }

    @Test void vo_ShouldCarryDateAndContent()
    {
        assertTrue(DailySummaryVo.class.isRecord(), "DailySummaryVo 必须为 record");
        final var components = DailySummaryVo.class.getRecordComponents();
        assertEquals(2, components.length);
        assertEquals("date", components[0].getName());
        assertEquals(LocalDate.class, components[0].getType());
        assertEquals("content", components[1].getName());
        assertEquals(String.class, components[1].getType());
    }
}
