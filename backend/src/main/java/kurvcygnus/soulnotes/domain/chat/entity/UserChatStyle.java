package kurvcygnus.soulnotes.domain.chat.entity;

import io.quarkus.hibernate.reactive.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.jetbrains.annotations.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 用户聊天风格实体, 对应 {@code user_chat_style} 表 (五轴表达偏好, P2 Task 1).
 * <p>五轴: {@code style} 表达基调 (七值) + {@code warmth}/{@code enthusiasm}/{@code headings}/{@code emoji}
 * 三态轴 (less/default/more); 仅约束共情对话回复的措辞与格式, 绝不改变角色定位、安全守则与预警行为
 * (安全边界: 预警检测/标题/追问/咨询员标签链一律不读本表).</p>
 *
 * @implNote 主键即 {@code user_id} (外键引用 {@code users.id}): 每用户恒至多一行, 写入端按
 *           {@code findById + persist} 天然幂等 upsert; 无行即全 default, 不做懒建行
 *           (读取端以 {@code ChatStyleVo.defaults()} 收口, 避免只读不写的用户产生垃圾行).
 * @since 2.1.0
 */
@Entity
@Table(name = "user_chat_style")
public final class UserChatStyle extends PanacheEntityBase
{
    //region 白名单常量
    //* 轴默认值: 全 default = 风格块空串 (组装结果与无风格注入的现状逐字节一致).
    public static final String AXIS_DEFAULT = "default";

    //* style 轴七值白名单: PUT 校验与 StyleDirectiveBuilder 归一化的同一值域事实源.
    public static final List<String> STYLE_VALUES = List.of(
        "default", "professional", "friendly", "direct", "optimist", "pragmatic", "witty"
    );

    //* 其余四轴三值白名单: warmth/enthusiasm/headings/emoji 共用.
    public static final List<String> TRI_STATE_VALUES = List.of("less", "default", "more");
    //endregion

    //region 字段
    //* 主键即用户 ID (一对一外键): 无独立代理键, upsert 语义由主键唯一性保证.
    @Id
    @Column(name = "user_id", nullable = false)
    public UUID userId;

    //* 表达基调 (七值): default/professional/friendly/direct/optimist/pragmatic/witty.
    @Column(nullable = false)
    public String style = AXIS_DEFAULT;

    //* 温暖程度 (三值): less/default/more.
    @Column(nullable = false)
    public String warmth = AXIS_DEFAULT;

    //* 热情程度 (三值): less/default/more.
    @Column(name = "enthusiasm", nullable = false)
    public String enthusiasm = AXIS_DEFAULT;

    //* 标题组织 (三值): less/default/more — 长回复的小标题使用倾向.
    @Column(nullable = false)
    public String headings = AXIS_DEFAULT;

    //* 表情使用 (三值): less/default/more — 回复中表情符号的使用倾向.
    @Column(nullable = false)
    public String emoji = AXIS_DEFAULT;

    //* 最近一次偏好落定时刻: 列默认 now() 只兜非应用插路径 (SQL 造数), 应用写入一律显式刷新.
    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;
    //endregion

    //region 写入辅助
    /**
     * 将五轴取值应用到本行并刷新 {@code updatedAt} (upsert 共用: 新建与更新走同一入口).
     *
     * @param style      表达基调取值 (调用方已过白名单校验)
     * @param warmth     温暖程度取值
     * @param enthusiasm 热情程度取值
     * @param headings   标题组织取值
     * @param emoji      表情使用取值
     */
    public void applyAxes(@NotNull String style, @NotNull String warmth, @NotNull String enthusiasm, @NotNull String headings, @NotNull String emoji)
    {
        this.style      = style;
        this.warmth     = warmth;
        this.enthusiasm = enthusiasm;
        this.headings   = headings;
        this.emoji      = emoji;
        this.updatedAt  = Instant.now();
    }
    //endregion
}
