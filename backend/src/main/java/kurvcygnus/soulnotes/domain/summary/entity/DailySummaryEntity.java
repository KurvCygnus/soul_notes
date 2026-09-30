package kurvcygnus.soulnotes.domain.summary.entity;

import io.quarkus.hibernate.reactive.panache.PanacheEntityBase;
import io.quarkus.panache.common.Page;
import io.smallrye.mutiny.Uni;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.jetbrains.annotations.NotNull;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 每日总结实体, 对应 {@code daily_summaries} 表.
 * <p>AI 生成的当日情绪总结留言 (一句总结 + 行动建议合并文本), 每用户每日至多一行,
 * 由 {@code DailySummaryGenerator} 于每日 03:00 对活跃用户批量生成 (fail-open, 可重跑覆写).</p>
 *
 * @implNote (user_id, date) 唯一约束即落库幂等锚点: 同日重跑覆写不重复落行 (查询语义见 {@code upsert} 消费方);
 *           该复合唯一索引同时服务按 user_id 前缀的今日/近程查询, 无需额外二级索引 (DDL 同款结论).
 * @since 1.5.0
 */
@Entity
@Table(
    name = "daily_summaries",
    uniqueConstraints = @UniqueConstraint(name = "uk_daily_summaries_user_date", columnNames = {"user_id", "date"})
)
public final class DailySummaryEntity extends PanacheEntityBase
{
    //region 字段
    //! ID 由应用层生成 (UUID), 与 users/ai_chat_sessions 同款 (避免暴露自增 ID).
    @Id
    public UUID id;

    @Column(name = "user_id", nullable = false)
    public UUID userId;

    //* 业务时区下的自然日 (非 UTC 切日): 生成与查询统一经 [[TimeUtils#ZONE_ASIA_SHANGHAI]] 取日期.
    @Column(nullable = false)
    public LocalDate date;

    @Column(nullable = false, columnDefinition = "TEXT")
    public String content;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
    //endregion

    //region 工厂方法
    /**
     * 受控工厂: 创建一行空总结 (content 由 upsert 消费方填充).
     *
     * @param userId 用户 ID
     * @param date   业务时区自然日
     * @return 未持久化的实体实例
     */
    public static @NotNull DailySummaryEntity create(@NotNull UUID userId, @NotNull LocalDate date)
    {
        final var summary = new DailySummaryEntity();
        summary.id        = UUID.randomUUID();
        summary.userId    = userId;
        summary.date      = date;
        summary.content   = "";
        summary.createdAt = Instant.now();
        return summary;
    }
    //endregion

    //region 静态查询
    /**
     * 查询用户指定自然日的总结行.
     *
     * @param userId 用户 ID
     * @param date   业务时区自然日
     * @return 匹配的总结行; 不存在时 {@link Uni} 以 {@code null} 项完成 (不抛异常), 调用方需判空
     */
    public static @NotNull Uni<DailySummaryEntity> findByUserAndDate(@NotNull UUID userId, @NotNull LocalDate date)
    {
        return find("userId = ?1 AND date = ?2", userId, date).firstResult();
    }

    /**
     * 查询用户最近 N 天的总结行 (日期倒序, 最新在前).
     *
     * @param userId 用户 ID
     * @param limit  返回条数上限 (调用方负责收敛到合理区间)
     * @return 总结行列表 (可能为空, 恒非 null); 命中 (user_id, date) 唯一索引前缀
     */
    public static @NotNull Uni<List<DailySummaryEntity>> findRecentByUser(@NotNull UUID userId, int limit)
    {
        return find("userId = ?1 ORDER BY date DESC", userId).page(Page.ofSize(limit)).list();
    }
    //endregion
}
