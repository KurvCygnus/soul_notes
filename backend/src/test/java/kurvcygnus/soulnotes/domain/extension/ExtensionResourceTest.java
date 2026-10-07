package kurvcygnus.soulnotes.domain.extension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.security.credential.Credential;
import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import kurvcygnus.soulnotes.domain.extension.builtin.AgendaExtension;
import kurvcygnus.soulnotes.domain.extension.builtin.ExamsExtension;
import kurvcygnus.soulnotes.domain.extension.builtin.TimetableExtension;
import kurvcygnus.soulnotes.domain.extension.dto.ExtInfoVo;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;
import java.security.Permission;
import java.security.Principal;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link ExtensionResource} 行为单元测试</b> (纯 JUnit, 不启 Quarkus, 资源直构造 +
 * 字段注入测试缝): 枚举形态 (三真实扩展在列 + 契约键)、查阅五形态
 * (成功外壳/未知名 404/坏 body 400/空白 body 400/SPI 实现方抛错 500 不上抛) 与 userId 服务端注入.
 *
 * @author Claude Code
 * @since 1.7.0
 */
class ExtensionResourceTest
{
    //* 固定测试用户: fake SecurityIdentity 的 principal 名, 断言 userId 注入的期望值.
    private static final UUID USER_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    //* 测试域独立声明的无参标记 (与 builtin NoArgs 同形, Registry 测试同款先例).
    record Args() {}

    //* REST-only 样例扩展: 不暴露 LLM 工具契约 (aiCallCommand null), 验证枚举键缺席语义.
    static final class RestOnlyExtension implements IDataExtension<List<String>, Args>
    {
        @Override public String name() { return "rest-only"; }
        @Override public Class<Args> argsType() { return Args.class; }
        @Override public List<String> query(UUID userId, Args args) { return List.of("数据"); }
        @Override public LLMToolSpec aiCallCommand() { return null; }
    }

    //* SPI 违约样例扩展: query 必抛, 验证资源兜底缝 (错误外壳, 绝不上抛); 顺带捕获 userId 验证注入.
    static final class ThrowingExtension implements IDataExtension<List<String>, Args>
    {
        private UUID capturedUserId;

        UUID capturedUserId() { return capturedUserId; }

        @Override public String name() { return "boom"; }
        @Override public Class<Args> argsType() { return Args.class; }
        @Override public List<String> query(UUID userId, Args args)
        {
            capturedUserId = userId;
            throw new IllegalStateException("SPI 违约: 实现方爆炸");
        }
        @Override public LLMToolSpec aiCallCommand()
        {
            return new LLMToolSpec("query_boom", "异常样例扩展", Schema.builder().build());
        }
    }

    //region 测试缝 (资源直构造 + fake 依赖)

    private static ExtensionResource resource(IDataExtension<?, ?>... extensions)
    {
        final var resource = new ExtensionResource();
        resource.registry = new ExtensionRegistry(fake(extensions), new ObjectMapper());
        resource.securityIdentity = fakeIdentity();
        resource.objectMapper = new ObjectMapper();
        return resource;
    }

    private static Instance<IDataExtension<?, ?>> fake(IDataExtension<?, ?>... beans)
    {
        final var list = List.of(beans);
        return new Instance<>()
        {
            @Override public Iterator<IDataExtension<?, ?>> iterator() { return list.iterator(); }
            @Override public IDataExtension<?, ?> get() { return list.getFirst(); }
            @Override public boolean isUnsatisfied() { return list.isEmpty(); }
            @Override public boolean isAmbiguous() { return list.size() > 1; }
            @Override public void destroy(IDataExtension<?, ?> bean) { throw new UnsupportedOperationException(); }
            @Override public Instance.Handle<IDataExtension<?, ?>> getHandle() { throw new UnsupportedOperationException(); }
            @Override public Iterable<? extends Instance.Handle<IDataExtension<?, ?>>> handles() { throw new UnsupportedOperationException(); }
            @Override public Instance<IDataExtension<?, ?>> select(java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
            @Override public <U extends IDataExtension<?, ?>> Instance<U> select(Class<U> subtype, java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
            @Override public <U extends IDataExtension<?, ?>> Instance<U> select(jakarta.enterprise.util.TypeLiteral<U> typeLiteral, java.lang.annotation.Annotation... qualifiers) { throw new UnsupportedOperationException(); }
        };
    }

    //* Quarkus 测试惯用 fake: 只落接口抽象方法, default 缝 (按类型取 principal/权限阻塞判定) 不覆写.
    private static SecurityIdentity fakeIdentity()
    {
        return new SecurityIdentity()
        {
            @Override public Principal getPrincipal() { return USER_ID::toString; }
            @Override public boolean isAnonymous() { return false; }
            @Override public Set<String> getRoles() { return Set.of(UserRole.ROLE_STUDENT); }
            @Override public boolean hasRole(String role) { return UserRole.ROLE_STUDENT.equals(role); }
            @Override public Set<Permission> getPermissions() { return Set.of(); }
            @Override public <T extends Credential> T getCredential(Class<T> credentialType) { return null; }
            @Override public Set<Credential> getCredentials() { return Set.of(); }
            @Override public <T> T getAttribute(String name) { return null; }
            @Override public Map<String, Object> getAttributes() { return Map.of(); }
            @Override public Uni<Boolean> checkPermission(Permission permission) { return Uni.createFrom().item(false); }
        };
    }

    //endregion

    //region 结构 (资源结构断言惯例)

    @Test void class_ShouldBeFinal()
    {
        assertTrue(Modifier.isFinal(ExtensionResource.class.getModifiers()));
    }

    @Test void class_ShouldHavePathAnnotation()
    {
        final var path = ExtensionResource.class.getAnnotation(Path.class);
        assertNotNull(path);
        assertEquals(ApiEndpointConstants.EXT_BASE, path.value());
    }

    //* 角色门禁必须真实在场: 仅注解在场但不含 STUDENT 一样把学生挡在门外, 故同时断言值.
    @Test void class_ShouldHaveRolesAllowedContainingStudent()
    {
        final var roles = ExtensionResource.class.getAnnotation(RolesAllowed.class);
        assertNotNull(roles);
        assertTrue(List.of(roles.value()).contains(UserRole.ROLE_STUDENT), "@RolesAllowed 必须含 STUDENT");
    }

    @Test void methods_ListAndQueryExist() throws Exception
    {
        assertNotNull(ExtensionResource.class.getMethod("list"));
        assertNotNull(ExtensionResource.class.getMethod("query", String.class, String.class));
        assertTrue(ExtensionResource.class.getMethod("list").isAnnotationPresent(GET.class));
        assertTrue(ExtensionResource.class.getMethod("query", String.class, String.class).isAnnotationPresent(POST.class));
    }

    //endregion

    //region GET 枚举

    @Test void list_ShouldEnumerateAllRegisteredExtensions()
    {
        final var shell = resource(new TimetableExtension(), new ExamsExtension(), new AgendaExtension(), new RestOnlyExtension()).list();
        assertEquals(0, shell.code);
        final var data = shell.data;
        assertNotNull(data);
        final var names = data.stream().map(ExtInfoVo::name).toList();
        assertEquals(4, names.size());
        assertTrue(names.containsAll(List.of("timetable", "exams", "agenda", "rest-only")), "三真实扩展 + REST-only 样例须全在列: " + names);
    }

    //* 经完整 JSON 序列化断言 (树驱动): command/description/parameters 三契约键形态与 NON_NULL 语义一并覆盖.
    @Test void list_TimetableItem_ShouldCarryToolContract()
    {
        final var tree = new ObjectMapper().valueToTree(resource(new TimetableExtension()).list());
        assertEquals("query_timetable", fieldNode(tree, "timetable", "command").asText());
        assertFalse(fieldNode(tree, "timetable", "description").asText().isBlank());
        //* parameters 为 ISchemaNode 树, Jackson 直接序列化为 JSON 对象 (REST 契约可行性).
        assertTrue(fieldNode(tree, "timetable", "parameters").isObject());
    }

    //* NON_NULL 语义: REST-only 扩展的 command/description/parameters 为 null, 序列化后三键须整体缺席.
    @Test void list_RestOnlyItem_ShouldOmitNullContractFields()
    {
        final var tree = new ObjectMapper().valueToTree(resource(new RestOnlyExtension()).list());
        assertEquals("rest-only", fieldNode(tree, "rest-only", "name").asText());
        assertNull(fieldNode(tree, "rest-only", "command"));
        assertNull(fieldNode(tree, "rest-only", "description"));
        assertNull(fieldNode(tree, "rest-only", "parameters"));
    }

    //endregion

    //region POST 查阅

    @Test void query_EmptyObjectBody_ShouldReturnSuccessShellWithDataArray()
    {
        try(final var response = resource(new TimetableExtension()).query("timetable", "{}"))
        {
            assertEquals(200, response.getStatus());
            final var shell = (ApiResponse<?>) response.getEntity();
            assertEquals(0, shell.code);
            assertInstanceOf(List.class, shell.data);
        }
    }

    //* userId 恒来自 SecurityIdentity (JWT subject), 客户端不可控 — 即便实现方抛错也应先收到注入的 ID.
    @Test void query_ShouldInjectUserIdFromSecurityIdentity()
    {
        final var boom = new ThrowingExtension();
        try(final var response = resource(boom).query("boom", "{}"))
        {
            assertEquals(USER_ID, boom.capturedUserId());
            assertEquals(500, response.getStatus());
        }
    }

    @Test void query_UnknownName_ShouldReturnNotFoundShell()
    {
        try(final var response = resource(new TimetableExtension()).query("nope", "{}"))
        {
            assertEquals(404, response.getStatus());
            final var shell = (ApiResponse<?>) response.getEntity();
            assertEquals(ErrorCode.BAD_REQUEST.getCode(), shell.code);
            assertTrue(shell.message.contains("nope"), "错误外壳须点名未知扩展: " + shell.message);
        }
    }

    @Test void query_MalformedJsonBody_ShouldReturnBadRequestShell()
    {
        try(final var response = resource(new TimetableExtension()).query("timetable", "not-json"))
        {
            assertEquals(400, response.getStatus());
            final var shell = (ApiResponse<?>) response.getEntity();
            assertEquals(ErrorCode.BAD_REQUEST.getCode(), shell.code);
            assertFalse(shell.message.isBlank());
        }
    }

    @Test void query_BlankBody_ShouldReturnBadRequestShell()
    {
        try(final var response = resource(new TimetableExtension()).query("timetable", "   "))
        {
            assertEquals(400, response.getStatus());
            final var shell = (ApiResponse<?>) response.getEntity();
            assertEquals(ErrorCode.BAD_REQUEST.getCode(), shell.code);
        }
    }

    //* JSON null 字面量: readValue 返回 null, 放行即以 null args 违反 SPI @NotNull 契约 —
    //! 宽容扩展会静默 200 携 null 语义, 消费型扩展 NPE 落 500 归因失真, 必须 400 形态就地拒绝.
    @Test void query_NullJsonBody_ShouldReturnBadRequestShell()
    {
        try(final var response = resource(new TimetableExtension()).query("timetable", "null"))
        {
            assertEquals(400, response.getStatus());
            final var shell = (ApiResponse<?>) response.getEntity();
            assertEquals(ErrorCode.BAD_REQUEST.getCode(), shell.code);
            assertFalse(shell.message.isBlank());
        }
    }

    //* SPI 违约防御: 实现方 query 抛错须兜成 500 错误外壳, 绝不让未处理异常逃出资源.
    @Test void query_ThrowingExtension_ShouldReturnErrorShellWithoutRethrow()
    {
        try(final var response = assertDoesNotThrow(() -> resource(new ThrowingExtension()).query("boom", "{}")))
        {
            assertEquals(500, response.getStatus());
            final var shell = (ApiResponse<?>) response.getEntity();
            assertEquals(ErrorCode.INTERNAL_ERROR.getCode(), shell.code);
            assertFalse(shell.message.isBlank());
        }
    }

    //endregion

    //* 在外壳 data 数组里按 name 定位枚举项并取字段节点: 键缺席时为 null (NON_NULL 断言用), 找不到扩展即失败.
    private static JsonNode fieldNode(JsonNode shellTree, String name, String field)
    {
        for(final var item: shellTree.get("data"))
            if(name.equals(item.get("name").asText()))
                return item.get(field);
        throw new AssertionError("枚举结果中找不到扩展 \"" + name + "\"");
    }
}
