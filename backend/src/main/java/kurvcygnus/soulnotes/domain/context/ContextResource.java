package kurvcygnus.soulnotes.domain.context;

import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import kurvcygnus.soulnotes.domain.context.dto.ContextSummaryVo;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jetbrains.annotations.NotNull;

import java.util.UUID;

/**
 * 学生情境 REST 资源: 向前端"你的情境"卡暴露领域数据聚合视图.
 *
 * @implNote 数据经 {@link DomainDataGateway} (fail-open); {@code ai.domain.adapter=none} 时三空数组,
 * 前端据此隐藏情境区. 聚合用 {@code Uni.combine().all().unis(...).asTuple()} 并联三路取数 — 串联链路需
 * Object[] 配对与强转 (简报原稿形态, 会产生 unchecked 告警), 元组形态零强转且行为等价.
 * @since 1.5.0
 */
@SuppressWarnings("JavadocDeclaration") @Path(ApiEndpointConstants.CONTEXT_BASE)
@RolesAllowed(UserRole.ROLE_STUDENT)
public final class ContextResource
{
    //* 考试/日程共用 30 天展望窗: 一学期节奏的合理覆盖面, 前端情境卡只消费近景.
    private static final int WINDOW_DAYS = 30;

    //? 有意注入具体类 DomainDataGateway 而非 DomainDataPort 接口: 接口有网关/适配器两个实现, 注接口构成 DI 歧义
    @Inject DomainDataGateway gateway;
    @Inject SecurityIdentity securityIdentity;

    //* 从 SecurityIdentity 提取当前用户 ID (即 JWT subject).
    private @NotNull UUID currentUserId() { return UUID.fromString(securityIdentity.getPrincipal().getName()); }

    /**
     * 学生情境聚合视图 (今日课表/未来考试/近期日程).
     *
     * @return 三数组外壳; {@code adapter=none} 或取数降级时各为空数组, 恒非 {@code null}
     */
    @GET @Path("/summary")
    public @NotNull Uni<ApiResponse<ContextSummaryVo>> summary()
    {
        final var userId = currentUserId();
        return Uni.combine().all().unis(
                gateway.todaySchedule(userId),
                gateway.upcomingExams(userId, WINDOW_DAYS),
                gateway.recentAgenda(userId, WINDOW_DAYS)
            ).asTuple().
            map(tuple -> new ContextSummaryVo(tuple.getItem1(), tuple.getItem2(), tuple.getItem3())).
            map(ApiResponse::success);
    }
}
