package kurvcygnus.soulnotes.domain.summary;

import com.fasterxml.jackson.core.type.TypeReference;
import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.scheduler.Scheduled;
import io.quarkus.vertx.core.runtime.context.VertxContextSafetyToggle;
import io.smallrye.common.vertx.VertxContext;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.ai.agent.DailySummaryAgent;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.domain.diary.entity.MoodDiary;
import kurvcygnus.soulnotes.domain.summary.entity.DailySummaryEntity;
import kurvcygnus.soulnotes.utils.JsonUtils;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.TimeUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;

/**
 * 每日总结生成器: 每日 03:00 (业务时区) 对近 7 天活跃用户批量生成当日情绪总结.
 * <p>链路: 聚合输入 (最近会话消息摘录 + 最近情绪分析摘记) → {@link DailySummaryAgent} 调 LLM →
 * 归一化截断 → 用户×日期唯一 upsert.</p>
 *
 * @implNote <b>fail-open 语义</b>: 任何环节失败 (输入聚合/LLM 调用/落库) 一律 WARN 留痕后跳过, 绝不向外抛错 —
 *           每日总结是锦上添花内容, 不可用只允许表现为"今日无絮语", 不允许拖垮调度与其他用户的生成.
 *           双输入全空 (无会话且无分析) 静默跳过, 不产生空 LLM 调用与空内容行.
 *           <b>线程纪律</b>: 调用方线程 (调度/测试/未来 HTTP 触发) 普遍没有"安全" Vert.x 上下文, Panache
 *           会话操作在该线程直接执行会同步抛 "No current Vertx context" — 故链式执行统一经
 *           {@link #runWithContext} 逐次建立安全 duplicated context 跳板 (ClinicalRetentionCleaner 先例),
 *           阻塞 LLM 调用再经 {@code vertx.executeBlocking} 切 worker 线程 (HR000068/069, ChatService 同款);
 *           外层只暴露非阻塞 Uni, 调度线程/事件循环零阻塞.
 * @since 1.5.0
 */
@SuppressWarnings("unused")//! AI Agent 为 Quarkus 运行时生成 Bean, IDE 静态分析误报注入点未满足依赖
//! (EmotionAnalysisService 同款先例, 该告警为存量口径; 运行时装配由集成测试钉死).
@ApplicationScoped
public final class DailySummaryGenerator
{
    private static final @NotNull Logger LOG = PrintUtils.getLogger();

    //* 摘录滚动上限 (条): ~20 条足以覆盖近期对话脉络, 兼顾 prompt token 预算.
    static final int EXCERPT_MAX_MESSAGES = 20;
    //* 单条摘录消息的截断长度 (字): 防超长单条消息撑爆 prompt.
    static final int EXCERPT_MESSAGE_MAX_CHARS = 120;
    //* 落库内容硬上限 (字): 一句总结 + 行动建议的合理量级, 提示词侧 80 字软约束的兜底.
    static final int CONTENT_MAX_CHARS = 200;
    //* 调度活跃窗 (天): 近 7 天有过会话或日记的用户才进入生成名单 (计划书契约).
    static final int ACTIVE_WINDOW_DAYS = 7;
    //* 单用户生成链的硬超时: LLM 自身受 quarkus.langchain4j.openai.timeout 约束, 此处兜住 DB 池耗尽等
    //* 无界悬挂, 防止串行调度链被单个用户卡死整晚.
    private static final Duration GENERATION_TIMEOUT = Duration.ofSeconds(120);

    //region 注入
    private final @NotNull DailySummaryAgent agent;
    private final @NotNull Vertx vertx;

    public DailySummaryGenerator(@NotNull DailySummaryAgent agent, @NotNull Vertx vertx)
    {
        this.agent = agent;
        this.vertx = vertx;
    }
    //endregion

    //region 调度入口
    /**
     * 每日 03:00 (cron 固定, 显式钉定 Asia/Shanghai 与业务时区同源, 不依赖 JVM 默认时区) 批量生成.
     *
     * @implNote 薄壳: 只拼装活跃名单与今日日期, 全部逻辑与容错收敛在 {@link #generateFor};
     *           订阅级兜底仅防意外实现缺陷 — fire-and-forget, 调度线程零阻塞零抛出.
     */
    @Scheduled(cron = "0 0 3 * * ?", timeZone = "Asia/Shanghai")
    void generateDailySummaries()
    {
        final var today = LocalDate.now(TimeUtils.ZONE_ASIA_SHANGHAI);
        activeUserIdsSince(Instant.now().minus(Duration.ofDays(ACTIVE_WINDOW_DAYS))).
            flatMap(userIds -> generateSequentially(userIds, today)).
            subscribe().with(
                v -> {},
                t -> LOG.warn("每日总结调度执行失败: {}", t.getMessage())
            );
    }

    //* 逐用户串行生成: 03:00 低峰期串行足以覆盖校园规模, 且避免对 LLM 网关形成并发洪峰;
    //* 单用户失败已在 generateFor 内部归一为完成, 串行链不会被单点打断.
    //* 非 static: 链内引用实例方法 generateFor (其内部依赖注入的 agent/vertx).
    private @NotNull Uni<Void> generateSequentially(@NotNull List<UUID> userIds, @NotNull LocalDate date)
    {
        Uni<Void> chain = Uni.createFrom().voidItem();
        for(final var userId: userIds)
            chain = chain.chain(v -> generateFor(userId, date));
        return chain;
    }

    /**
     * 聚合活跃窗内的用户名单: 近期有会话或日记的用户去重并集.
     *
     * @param cutoff 活跃下界时刻 (含)
     * @return 去重后的用户 ID 列表 (可能为空, 恒非 null, 无稳定排序保证)
     */
    Uni<List<UUID>> activeUserIdsSince(@NotNull Instant cutoff)
    {
        return runWithContext(() -> Panache.withSession(() ->
            //* 两路查询串行而非 Uni.combine 并联: 同一 HR session 上的并发查询会触发
            //* "Illegal pop() with non-matching JdbcValuesSourceProcessingState", 调度场景串行时延可忽略.
            AiChatSession.findUpdatedSince(cutoff).
                flatMap(sessions -> MoodDiary.findCreatedSince(cutoff).map(diaries ->
                    Stream.concat(
                            sessions.stream().map(s -> s.userId),
                            diaries.stream().map(d -> d.userId)).
                        distinct().
                        toList()))
        ));
    }
    //endregion

    //region 生成链路
    /**
     * 为单个用户生成指定日期的总结 (生成链路的唯一收口, 调度与测试共用).
     *
     * @param userId 用户 ID
     * @param date   业务时区自然日 (每用户每日一行, 同日重跑覆写)
     * @return 完成信号; 恒成功完成 (任何失败已内部 WARN 归一, fail-open)
     */
    public @NotNull Uni<Void> generateFor(@NotNull UUID userId, @NotNull LocalDate date)
    {
        return runWithContext(() -> generatePipeline(userId, date)).
            ifNoItem().after(GENERATION_TIMEOUT).
            failWith(() -> new IllegalStateException(PrintUtils.quickFormat("每日总结生成超时 (>{}s)", GENERATION_TIMEOUT.toSeconds()))).
            onFailure().
            invoke(t -> LOG.warn("每日总结生成失败, fail-open 跳过: userId={}, date={}, {}", userId, date, t.getMessage())).
            //* Void 链的失败归一: recoverWithItem null 项即完成信号 (Mutiny 无 recoverWithVoid, ChatService 同款).
            onFailure().
            recoverWithItem(() -> null);
    }

    /**
     * 生成链本体 (须在安全 duplicated context 内执行): 聚合输入 → 阻塞 LLM (worker) → 归一化 → upsert.
     *
     * @return 完成信号
     */
    private @NotNull Uni<Void> generatePipeline(@NotNull UUID userId, @NotNull LocalDate date)
    {
        return Panache.withSession(() -> gatherInputs(userId)).
            flatMap(inputs ->
            {
                //* 双输入全空: 无话可总结, 静默跳过 (零 LLM 调用零落库), debug 级留痕即可.
                if(inputs == null)
                {
                    LOG.debug("每日总结跳过 (无会话且无分析输入): userId={}", userId);
                    return Uni.createFrom().voidItem();
                }
                //! HR000068/069: 阻塞 LLM 调用必须经 executeBlocking 在 worker 线程执行,
                //! 结果回事件循环后再续 Panache 链 — 直接在本上下文调用会阻塞事件循环.
                return vertx.executeBlocking(
                        () -> agent.summarize(AiPromptConstants.DAILY_SUMMARY_SYSTEM_PROMPT, inputs.sessionExcerpt(), inputs.analysisDigest()),
                        false
                    ).
                    onItem().transform(DailySummaryGenerator::normalizedContent).
                    flatMap(content ->
                    {
                        if(content == null)
                        {
                            LOG.warn("每日总结 LLM 回复为空, 跳过落库: userId={}", userId);
                            return Uni.createFrom().voidItem();
                        }
                        return Panache.withTransaction(() -> upsert(userId, date, content));
                    });
            });
    }

    /**
     * 无上下文调用方的统一跳板: 逐次建立"安全"duplicated context 并在其事件循环上执行 Panache 链.
     *
     * @param chain 须在上下文内执行的响应式链
     * @param <T>  链的产出类型
     * @return 与链等价的发布者; 调用方线程仅做上下文搭建, 零阻塞
     * @implNote {@code ClinicalRetentionCleaner#cleanOnce} 先例的泛化: 静态 Panache 解析会话强依赖
     *           被标记安全的 Vert.x context, 调度线程/JUnit 线程均无, 必须显式建链跳转;
     *           runOnContext 回调内的同步异常不会流经 emitter, 以 try-catch 兜底转为失败信号.
     *           已知副作用 (先例同款): 无上下文线程上 getOrCreateDuplicatedContext 会残留 thread-local
     *           context, 本类消费面 (调度/测试) 无跨组件 commonPool 复用, 残留暂无实害.
     */
    private <T> @NotNull Uni<T> runWithContext(@NotNull Supplier<? extends @NotNull Uni<T>> chain)
    {
        final var duplicated = VertxContext.getOrCreateDuplicatedContext(vertx.getDelegate());
        VertxContextSafetyToggle.setContextSafe(duplicated, true);
        return Uni.createFrom().emitter(
            emitter ->
            duplicated.runOnContext(
                _ ->
                {
                    try { chain.get().subscribe().with(emitter::complete, emitter::fail); }
                    catch(RuntimeException e) { emitter.fail(e); }//* 同步建链异常 (上下文/配置解析) 转为失败信号.
                }
            )
        );
    }
    //endregion

    //region 输入聚合
    //* 双输入快照: 两字段均保证非 null (缺席以空串占位), 全空时 gatherInputs 发出 null 项.
    private record SummaryInputs(@NotNull String sessionExcerpt, @NotNull String analysisDigest) {}

    /**
     * 聚合总结输入: 最近会话消息摘录 + 最近一次情绪分析摘记.
     *
     * @param userId 用户 ID
     * @return 输入快照; 双输入全空时以 {@code null} 项完成 (调用方跳过本轮生成)
     */
    private @NotNull Uni<@Nullable SummaryInputs> gatherInputs(@NotNull UUID userId)
    {
        return AiChatSession.findByUserId(userId).
            flatMap(sessions ->
            {
                final var excerpt = buildExcerpt(sessions);
                return latestAnalysisDigest(userId).
                    map(digest -> excerpt.isBlank() && digest.isBlank() ? null : new SummaryInputs(excerpt, digest));
            });
    }

    /**
     * 从最近会话向前滚动收集消息尾段: 至多 {@link #EXCERPT_MAX_MESSAGES} 条, 单条截断封顶.
     *
     * @param sessions 该用户会话列表 (按最近活跃倒序, findByUserId 契约)
     * @return "role: content" 逐行摘录; 无消息时为空串
     */
    private static @NotNull String buildExcerpt(@NotNull List<AiChatSession> sessions)
    {
        final var lines = new ArrayList<String>(EXCERPT_MAX_MESSAGES);
        for(final var session: sessions)
        {
            if(lines.size() >= EXCERPT_MAX_MESSAGES)
                break;
            for(final var message: tailMessages(session.messages, EXCERPT_MAX_MESSAGES - lines.size()))
            {
                lines.add(PrintUtils.quickFormat("{}: {}",
                    message.getOrDefault("role", "unknown"),
                    truncate(message.getOrDefault("content", ""), EXCERPT_MESSAGE_MAX_CHARS)));
            }
        }
        return String.join("\n", lines);
    }

    /**
     * 解析会话消息 JSONB 的尾部 N 条 (对话时序保序).
     *
     * @implNote 损坏 JSON 按空列表降级并 WARN — 单会话损坏只损失该会话摘录, 不阻断整体生成 (输入侧 fail-open).
     */
    private static @NotNull List<Map<String, String>> tailMessages(@Nullable String messagesJson, int max)
    {
        if(messagesJson == null || messagesJson.isBlank() || max <= 0)
            return List.of();
        try
        {
            final var messages = JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() {});
            return messages.subList(Math.max(0, messages.size() - max), messages.size());
        }
        catch(Exception e)
        {
            LOG.warn("解析会话消息失败, 该会话跳过摘录: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 取最近一条带分析结果日记的情绪摘记.
     *
     * @param userId 用户 ID
     * @return 摘记串 (summary/天气/三值分); 无记录或解析失败为空串 (输入侧 fail-open, 不抛错)
     */
    private static @NotNull Uni<@NotNull String> latestAnalysisDigest(@NotNull UUID userId)
    {
        return MoodDiary.
            find("userId = ?1 AND analysisResult IS NOT NULL ORDER BY createdAt DESC", userId).
            <MoodDiary>firstResult().
            map(diary -> diary == null ? "" : digestAnalysis(diary.analysisResult));
    }

    //* 情绪分析摘记取 summary + weather + 三值分: summary 是共情文本主体, 数值供模型感知量级,
    //* warningLevel/warningReason 有意排除 — 每日总结面向用户, 预警字段属机构侧信息, 严禁回流进用户可见文案.
    private static @NotNull String digestAnalysis(@Nullable String analysisJson)
    {
        if(analysisJson == null || analysisJson.isBlank())
            return "";
        try
        {
            final var map = JsonUtils.parseJson(analysisJson, new TypeReference<Map<String, Object>>() {});
            return PrintUtils.quickFormat("summary={}, weather={}, positive={}, negative={}, anxiety={}",
                truncate(String.valueOf(map.getOrDefault("summary", "")), EXCERPT_MESSAGE_MAX_CHARS),
                map.getOrDefault("weather", ""),
                map.getOrDefault("positive", ""),
                map.getOrDefault("negative", ""),
                map.getOrDefault("anxiety", ""));
        }
        catch(Exception e)
        {
            LOG.warn("解析情绪分析结果失败, 该条跳过摘录: {}", e.getMessage());
            return "";
        }
    }

    //* 定长截断: 中文场景按 char 切分即可 (提示词内容为 BMP 字符), 不做代理对补齐的过度设计.
    private static @NotNull String truncate(@NotNull String text, int max)
    {
        return text.length() <= max ? text : text.substring(0, max);
    }
    //endregion

    //region 归一化与落库
    /**
     * 归一化 LLM 回复: 剥离首尾空白; 纯空白拒绝; 超长截断封顶.
     *
     * @param reply LLM 原始回复
     * @return 可落库内容; 纯空白为 {@code null} (调用方跳过落库, 不产生空内容行)
     */
    static @Nullable String normalizedContent(@NotNull String reply)
    {
        final var stripped = reply.strip();
        if(stripped.isEmpty())
            return null;
        return truncate(stripped, CONTENT_MAX_CHARS);
    }

    /**
     * 用户×日期唯一 upsert (须在事务内执行, 事务由 {@code generatePipeline} 的 withTransaction 外壳开启):
     * 已有当日行则覆写 content/createdAt (同日重跑幂等), 缺席才插入.
     *
     * @implNote 读改写收敛进单事务: 实体出事务即分离, 再 persist 会退化为同 id 重 INSERT (ChatService 实测先例).
     */
    private static @NotNull Uni<Void> upsert(@NotNull UUID userId, @NotNull LocalDate date, @NotNull String content)
    {
        return DailySummaryEntity.findByUserAndDate(userId, date).
            flatMap(existing ->
            {
                final var entity = existing == null ? DailySummaryEntity.create(userId, date) : existing;
                entity.content    = content;
                entity.createdAt  = Instant.now();
                return entity.persist().replaceWithVoid();
            });
    }
    //endregion
}
