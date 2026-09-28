package kurvcygnus.soulnotes.domain.context;

import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.Path;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ContextResource} 结构单元测试</b> (纯 JUnit, 不启 Quarkus — 沿用 {@code ChatResourceTest} 先例).
 * <p>final 断言必须在 Quarkus 增强外执行: 运行期 ArC 为承载 {@code @RolesAllowed} 拦截器
 * 会子类化资源 Bean 并剥除 ACC_FINAL, @QuarkusTest 上下文内恒测得非 final (实测),
 * 故结构测试与契约集成测试 ({@code ContextResourceContractTest}) 分置两文件.</p>
 * @since 1.5.0
 */
class ContextResourceTest
{
    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(ContextResource.class.getModifiers()));
    }

    @Test void class_ShouldHavePathAnnotation()
    {
        final var path = ContextResource.class.getAnnotation(Path.class);
        assertNotNull(path);
        assertEquals(ApiEndpointConstants.CONTEXT_BASE, path.value());
    }

    //* 角色门禁必须真实在场: 仅注解在场但不含 STUDENT 一样把学生挡在门外, 故同时断言值.
    @Test void class_ShouldHaveRolesAllowedContainingStudent()
    {
        final var roles = ContextResource.class.getAnnotation(RolesAllowed.class);
        assertNotNull(roles);
        assertTrue(Arrays.asList(roles.value()).contains(UserRole.ROLE_STUDENT), "@RolesAllowed 必须含 STUDENT");
    }

    @Test void methods_SummaryExists() throws Exception
    {
        assertNotNull(ContextResource.class.getMethod("summary"));
    }
}
