package kurvcygnus.soulnotes.domain.summary;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import kurvcygnus.soulnotes.domain.summary.dto.DailySummaryVo;
import kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.utils.TimeUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jetbrains.annotations.NotNull;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 学生每日总结 REST 资源: 向前端"每日絮语"卡暴露当日总结与近程列表.
 *
 * @implNote 只读消费面: 生成侧在 {@link DailySummaryGenerator} (fail-open), 本资源恒 200 外壳 —
 *           今日无总结时 {@code data} 键缺席 (ApiResponse NON_NULL 序列化契约), 前端据此安静降级;
 *           读路径经 {@code Panache.withSession} 自持会话, 与生成侧事务解耦.
 * @since 1.5.0
 */
@Path(ApiEndpointConstants.SUMMARY_BASE)
@RolesAllowed(UserRole.ROLE_STUDENT)
public final class DailySummaryResource
{
    //* recent 缺省条数与硬上限: 缺省 7 天对齐"近一周絮语"的卡片视图; 上限防负值/巨值直达分页层.
    static final int DEFAULT_RECENT_LIMIT = 7;
    static final int MAX_RECENT_LIMIT = 30;

    @Inject SecurityIdentity securityIdentity;

    //* 从 SecurityIdentity 提取当前用户 ID (即 JWT subject).
    private @NotNull UUID currentUserId() { return UUID.fromString(securityIdentity.getPrincipal().getName()); }

    /**
     * 当前用户的今日总结 (业务时区自然日).
     *
     * @return 当日总结; 今日尚无总结时 {@code data} 为 {@code null} (序列化后键缺席)
     */
    @GET @Path("/daily")
    public @NotNull Uni<ApiResponse<DailySummaryVo>> daily()
    {
        return Panache.withSession(() ->
                DailySummaryEntity.findByUserAndDate(currentUserId(), LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI))
        ).
            map(summary -> ApiResponse.success(summary == null ? null : toVo(summary)));
    }

    /**
     * 当前用户的近程总结列表 (按日期倒序, 最新在前).
     *
     * @param limit 返回条数, 缺省 7; 非正值回退缺省, 超上限压至 30
     * @return 总结列表 (无数据时为空数组, 恒非 null)
     */
    @GET @Path("/recent")
    public @NotNull Uni<ApiResponse<List<DailySummaryVo>>> recent(@QueryParam("limit") @DefaultValue("7") int limit)
    {
        return Panache.withSession(() -> DailySummaryEntity.findRecentByUser(currentUserId(), capLimit(limit))).
            map(summaries -> ApiResponse.success(summaries.stream().map(DailySummaryResource::toVo).toList()));
    }

    //* limit 防御收敛: 负值/0 回退缺省 (语义化"给个合理默认"), 正值封顶 30 — 分页层只见合法区间.
    private static int capLimit(int limit) { return limit <= 0 ? DEFAULT_RECENT_LIMIT : Math.min(limit, MAX_RECENT_LIMIT); }

    private static @NotNull DailySummaryVo toVo(@NotNull DailySummaryEntity entity)
    {
        return new DailySummaryVo(entity.date, entity.content);
    }
}
