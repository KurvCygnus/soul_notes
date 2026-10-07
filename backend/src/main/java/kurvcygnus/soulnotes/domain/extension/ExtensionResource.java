package kurvcygnus.soulnotes.domain.extension;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import kurvcygnus.soulnotes.domain.extension.dto.ExtInfoVo;
import kurvcygnus.soulnotes.domain.extension.dto.ExtensionNotifyRequest;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.constants.RedisKeyConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * 数据扩展 REST 出口 (spec §5): 枚举注册表全部扩展的元信息, 并按名查阅数据 —
 * 与 LLM 工具出口 ({@link ExtensionToolProvider}) 共用 {@link IDataExtension#query} 同一执行体 (D2).
 * <p>身份恒服务端注入: userId 取自 {@link SecurityIdentity} (JWT subject), body 里不允许出现任何身份字段.</p>
 *
 * @implNote <b>错误形态</b>: {@link ExtensionException} 是裸 {@link RuntimeException} 而非
 *           {@link kurvcygnus.soulnotes.exception.StructuredException}, 既有 {@code GlobalExceptionMapper}
 *           兜不住, 故未知名/坏 body/SPI 实现方抛错三态在资源内就地兜成 {@link ApiResponse} 错误外壳 —
 *           绝不让未处理异常逃出资源. 错误码复用既有通用 {@link ErrorCode} (BAD_REQUEST/INTERNAL_ERROR)
 *           + 精确 detail 文案, 未引入扩展域专用错误码 (动共享枚举超出本任务文件面, 留团队裁决).
 *           <b>通配符捕获</b>: 注册表持异构扩展 ({@code IDataExtension<?, ?>}), 直调 {@code query(A)} 过不了
 *           javac — 经 {@link #invokeQuery} 泛型缝把 args 收窄回 A ({@code argsType()} 运行时即 A 的 Class,
 *           cast 安全且零未检告警).
 *           <b>同步返回</b>: 端点刻意不返回 {@code Uni} — RESTEasy Reactive 智能调度把同步方法落 worker
 *           线程执行, 恰好承载可能阻塞 IO 的第三方 SPI query; 若照搬全项目端点 Uni 形态反而令 SPI 上事件
 *           循环成阻塞隐患 — 除非同时加 {@code @Blocking}, 否则不得 Uni 化 (D8 评审裁决).
 * @since 1.7.0
 */
@Path(ApiEndpointConstants.EXT_BASE)
//* ADMIN 放行: 扩展页 C1 双裁定后收归 ADMIN 治理视角 (前端 RequireAdmin), 若 REST 仍仅 STUDENT,
//! 唯一能进页面的角色会 403 自降级拿到空数据 — 治理读数与 STUDENT 自用共面, toggleNotify 亦为本人语义.
@RolesAllowed({UserRole.ROLE_STUDENT, UserRole.ROLE_ADMIN})
public final class ExtensionResource
{
    private static final Logger LOGGER = PrintUtils.getLogger();

    @Inject ExtensionRegistry registry;
    @Inject SecurityIdentity securityIdentity;
    @Inject ObjectMapper objectMapper;
    //* 响应式 Redis: 通知启用开关的读写面 (P3) — 键 ext:notify:on:{userId}:{extName}, "1"/缺席, TTL 永久.
    @Inject ReactiveRedisDataSource redisDS;

    //region 端点

    /**
     * 扩展元信息枚举: 每注册扩展一项; 工具契约字段仅暴露给 LLM 的扩展存在 ({@code NON_NULL} 缺席即 null).
     *
     * @return 统一外壳携带 {@link ExtInfoVo} 列表, 恒非 {@code null} (空注册表为空数组)
     */
    @GET
    public @NotNull ApiResponse<List<ExtInfoVo>> list()
    {
        final var infos = new ArrayList<ExtInfoVo>();
        for(final var extension: registry.all())
            infos.add(toInfo(extension));
        return ApiResponse.success(List.copyOf(infos));
    }

    /**
     * 按名查阅: body 为该扩展 {@code argsType()} 形态的任意 JSON (按扩展声明反序列化, 不绑定具体 POJO).
     *
     * @param name 扩展 ID (路径段)
     * @param body 查询参数原始 JSON; 空参扩展传空对象 {@code "{}"} 即可, 不得为 JSON null (400 形态拒绝)
     * @return 200 成功外壳携带数据; 未知名 404 / 坏 body (含 JSON null) 400 / 实现方抛错 500 的错误外壳
     */
    @POST @Path("/{name}/query") @Consumes(MediaType.APPLICATION_JSON)
    public @NotNull Response query(@PathParam("name") @NotNull String name, @NotNull String body)
    {
        Objects.requireNonNull(body, "Param \"body\" must not be null!");

        final IDataExtension<?, ?> extension;
        try { extension = registry.byName(name); }
        catch(final ExtensionException e) //* 消息由注册表构造恒非空 — 直接复用免双份字面量漂移.
            { return errorShell(Response.Status.NOT_FOUND, ErrorCode.BAD_REQUEST, Objects.requireNonNull(e.getMessage(), "违例消息必须存在")); }

        if(body.isBlank())
            return errorShell(Response.Status.BAD_REQUEST, ErrorCode.BAD_REQUEST, "查询参数为空白, 需为合法 JSON");

        final Object args;
        try { args = objectMapper.readValue(body, extension.argsType()); }
        catch(final JsonProcessingException e)
            { return errorShell(Response.Status.BAD_REQUEST, ErrorCode.BAD_REQUEST, PrintUtils.quickFormat("查询参数不是合法 JSON: {}", e.getOriginalMessage())); }
        //* JSON null 字面量令 readValue 返回 null: 放行即以 null args 违反 SPI @NotNull 契约 —
        //! 宽容扩展静默 200 携 null 语义, 消费型扩展 NPE 落 500 归因失真, 必须就地 400 形态拒绝.
        if(args == null)
            return errorShell(Response.Status.BAD_REQUEST, ErrorCode.BAD_REQUEST, "查询参数不得为 JSON null");

        //* userId 在 SPI 调用的 try 域外先行求值: SecurityIdentity 异常若混进下方 catch 会被误归因为
        //! "扩展查询失败" (500) — 鉴权上下文问题须按其本来面目暴露, 归因不失真.
        final UUID userId = currentUserId();

        final Object result;
        try { result = invokeQuery(extension, userId, args); }
        catch(final RuntimeException e)
        {
            LOGGER.warn(PrintUtils.quickFormat("数据扩展 \"{}\" 查询异常, 兜底为错误外壳", name), e);
            return errorShell(Response.Status.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, PrintUtils.quickFormat("数据扩展 \"{}\" 查询失败", name));
        }
        return Response.ok(ApiResponse.success(result)).build();
    }

    /**
     * 扩展通知开关翻转 (P3): {@code {"enabled":true}} 落 Redis 开关键 ("1", TTL 永久),
     * {@code false} 删除开关键 (缺席 = 默认关).
     *
     * @param name 扩展 ID (路径段; 先于负载校验寻址, 未知名与查阅端点同形态 404)
     * @param body 开关负载原始 JSON
     * @return 200 成功外壳; 未知名 404 / 坏 body 或 {@code enabled} 缺席 400 / Redis 故障 500 的错误外壳
     * @implNote 返回 {@code Uni}: Redis 读写为响应式 IO, 与查阅端点的同步形态 (承载可能阻塞的第三方 SPI)
     *           不同 — 本端点无阻塞调用, Uni 化零调度开销 (RESTEasy Reactive 智能调度兼容两种形态).
     *           extName 先行寻址: 未知名不落任何 Redis 键, 也不泄露负载校验细节.
     * @since 2.2.0
     */
    @PUT @Path("/{name}/notify") @Consumes(MediaType.APPLICATION_JSON)
    public @NotNull Uni<Response> toggleNotify(@PathParam("name") @NotNull String name, @NotNull String body)
    {
        Objects.requireNonNull(body, "Param \"body\" must not be null!");

        try { registry.byName(name); }
        catch(final ExtensionException e) //* 消息由注册表构造恒非空 — 与查阅端点未知名同码同形态 (404 外壳).
            { return Uni.createFrom().item(errorShell(Response.Status.NOT_FOUND, ErrorCode.BAD_REQUEST, Objects.requireNonNull(e.getMessage(), "违例消息必须存在"))); }

        if(body.isBlank())
            return Uni.createFrom().item(errorShell(Response.Status.BAD_REQUEST, ErrorCode.BAD_REQUEST, "请求体为空白, 需为合法 JSON"));

        final ExtensionNotifyRequest request;
        try { request = objectMapper.readValue(body, ExtensionNotifyRequest.class); }
        catch(final JsonProcessingException e)
            { return Uni.createFrom().item(errorShell(Response.Status.BAD_REQUEST, ErrorCode.BAD_REQUEST, PrintUtils.quickFormat("请求体不是合法 JSON: {}", e.getOriginalMessage()))); }
        //* JSON null 字面量令 readValue 返回 null: 与 enabled 缺席同码拒绝 — 开关是显式用户意图, 不做缺省推断.
        if(request == null || request.enabled() == null)
            return Uni.createFrom().item(errorShell(Response.Status.BAD_REQUEST, ErrorCode.BAD_REQUEST, "enabled 必须为布尔值"));

        final var key = RedisKeyConstants.EXT_NOTIFY_SWITCH.formatted(currentUserId(), name);
        final Uni<Void> write = request.enabled()
            ? redisDS.value(String.class).set(key, "1")          //* TTL 永久: 开关是长效用户偏好, 非临时窗口.
            : redisDS.key().del(key).replaceWithVoid();
        //* 先 transform 成 Response 再挂恢复: Mutiny 的失败组保持原元素类型, 先恢复后变换会碰 Void 型不匹配.
        return write.
            onFailure().invoke(t -> LOGGER.warn(PrintUtils.quickFormat("扩展通知开关写入失败: name={}, {}", name), t)).
            onItem().transform(_ -> Response.ok(ApiResponse.success()).build()).
            onFailure().recoverWithItem(
                t -> errorShell(Response.Status.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, "通知开关写入失败, 请稍后重试")
            );
    }

    //endregion

    //region 内部缝

    //* 从 SecurityIdentity 提取当前用户 ID (即 JWT subject) — 与项目既有受保护资源同一取法.
    private @NotNull UUID currentUserId() { return UUID.fromString(securityIdentity.getPrincipal().getName()); }

    private static @NotNull ExtInfoVo toInfo(@NotNull IDataExtension<?, ?> extension)
    {
        final var spec = extension.aiCallCommand();
        if(spec == null)
            return new ExtInfoVo(extension.name(), null, null, null);
        return new ExtInfoVo(extension.name(), spec.command(), spec.description(), spec.parameters());
    }

    /**
     * 查阅泛型缝: 通配符捕获 ({@code ?}) 下 {@code query(A)} 直调不可表达 —
     * 借 {@code argsType().cast} 把 {@code Object} 收窄回声明的 A, 全程类型安全零告警.
     */
    private static <A> Object invokeQuery(@NotNull IDataExtension<?, A> extension, @NotNull UUID userId, @NotNull Object args)
        { return extension.query(userId, extension.argsType().cast(args)); }

    //* 就地错误外壳: ExtensionException 非 StructuredException, GlobalExceptionMapper 兜不住, 须资源内自行渲染.
    private static @NotNull Response errorShell(@NotNull Response.Status status, @NotNull ErrorCode code, @NotNull String detail)
        { return Response.status(status).entity(ApiResponse.error(code, detail)).build(); }

    //endregion
}
