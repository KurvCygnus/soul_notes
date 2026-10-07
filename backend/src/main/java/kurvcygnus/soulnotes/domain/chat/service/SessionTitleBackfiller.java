package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.vertx.core.runtime.context.VertxContextSafetyToggle;
import io.smallrye.common.vertx.VertxContext;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.utils.JsonUtils;
import kurvcygnus.soulnotes.utils.PrintUtils;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

/**
 * 无标题会话启动回填器: 启动时对存量无标题会话做一次性确定性回填 —
 * 首条用户消息剥离首尾空白后截断 {@link SessionTitleGenerator#TITLE_MAX_CHARS} 字为标题, 不经 LLM.
 * <p>存量/Mock 会话创建于标题特性上线前, 永远错过"首轮交换"生成挂点; 回填让它们与新生会话同享标题体验.</p>
 *
 * @implNote <b>确定性契约</b>: 回填零 LLM 外呼 (标题生成是首轮交换链路的职责, 回填不与之争抢), 截断口径
 *           与 {@link SessionTitleGenerator#fallbackTitle} 完全一致.
 *           <b>fail-open 语义</b>: 单会话消息 JSONB 损坏/落库失败仅 WARN 跳过该会话, 不阻断同批其他会话;
 *           整体失败也只 WARN, 不影响服务启动可用. 零用户消息 (空历史/仅助手) 会话保持 null — 无话可命标题.
 *           <b>幂等与竞态</b>: 只触 {@code title IS NULL} 行, 重复执行/重启重放天然无写放大; 与标题生成器
 *           双向闸门互斥 (生成器 persistTitle 亦只在标题为 null 时写入), 交错时最后落库者胜出 — 而回填挂点
 *           在 {@code StartupEvent}, 早于 HTTP 流量, 生产语义下该窗口仅存于理论 (重启瞬间的在途 fire-and-forget
 *           标题链随进程消亡, 不再有写入方). 回填只改 title 列, 不触碰 updatedAt, 侧栏排序不受扰动.
 *           <b>线程纪律</b>: 启动线程无"安全" Vert.x 上下文, Panache 静态查询会同步抛
 *           "No current Vertx context" — 经 {@link #runWithContext} 逐次建立安全 duplicated context 跳板
 *           (ClinicalRetentionCleaner/SessionTitleGenerator 先例), 外层再以 {@code CompletableFuture.runAsync}
 *           隔离 duplicated context 在启动线程上的 thread-local 残留 (ClinicalRetentionCleaner 同款).
 * @since 1.6.0
 */
@SuppressWarnings("unused")//! 生命周期回调由框架经反射调用, IDE 静态分析误报注入点/形参未使用 (ClinicalRetentionCleaner 同款).
@ApplicationScoped
public final class SessionTitleBackfiller
{
    private static final @NotNull Logger LOG = PrintUtils.getLogger();

    //region 注入
    private final @NotNull Vertx vertx;

    @Inject
    public SessionTitleBackfiller(@NotNull Vertx vertx) { this.vertx = vertx; }
    //endregion

    //region 启动钩子
    /**
     * 启动钩子: 异步执行一次回填, 失败仅 WARN (回填失败不影响服务可用).
     *
     * @implNote runAsync 隔离启动线程: getOrCreateDuplicatedContext 会在调用线程残留 thread-local
     *           context (ClinicalRetentionCleaner 同款已知副作用, commonPool 消费面无实害), 且启动线程
     *           零阻塞 — 回填完成与否都不拖慢启动.
     */
    @SuppressWarnings("unused")//! ev 形参为 @Observes 契约所需, 静态分析误报未使用 (ClinicalRetentionCleaner 同款).
    void onStart(@Observes @NotNull StartupEvent ev)
    {
        CompletableFuture.runAsync(
            () ->
            backfillOnce().subscribe().with(
                count -> { if(count > 0) LOG.info(PrintUtils.quickFormat("无标题会话启动回填完成: 回填 {} 个会话", count)); },
                f -> LOG.warn("无标题会话启动回填失败: {}", f.getMessage())
            )
        );
    }

    /**
     * 执行一次回填 (生成链路的唯一收口, 启动钩子与测试共用).
     *
     * @return 本次回填写入标题的会话数; 恒成功完成 (任何失败已内部 WARN 归一, fail-open)
     */
    public @NotNull Uni<Long> backfillOnce() { return runWithContext(this::backfillPipeline); }
    //endregion

    //region 回填链路
    /**
     * 回填链本体 (须在安全 duplicated context 内执行): 名单装载 → 逐会话串行回填.
     *
     * @return 回填写入数
     */
    private @NotNull Uni<Long> backfillPipeline()
    {
        return Panache.withSession(AiChatSession::findTitleless).
            flatMap(sessions ->
            {
                //* 逐会话串行而非并联: 同一 HR session 上的并发操作会触发
                //* "Illegal pop() with non-matching JdbcValuesSourceProcessingState" (DailySummaryGenerator 先例),
                //* 启动期一次性路径串行时延可忽略.
                Uni<Long> chain = Uni.createFrom().item(0L);
                for(final var session: sessions)
                    chain = chain.chain(backfilled -> backfillSingle(session).map(n -> backfilled + n));
                return chain;
            });
    }

    /**
     * 单会话回填: 独立事务内重载 → 三闸门 (行仍无标题 + 来源非 manual + 有用户消息) → 截断落库.
     *
     * @param detached 名单装载阶段的会话快照 (仅取 id 寻址, 状态以事务内重载为准)
     * @return 该会话是否写入 (1/0); 失败归一为 0 并 WARN — 单会话失败不阻断串行链 (fail-open per session)
     * @implNote 读改写收敛进单事务: 实体出事务即分离, 再 persist 会退化为同 id 重 INSERT (ChatService 实测先例);
     *           事务内重载同时构成幂等守卫 — 快照之后标题已被生成器/上一轮回填写入时静默跳过;
     *           title_source='manual' (用户重命名/存量非托管行) 独立于标题非空闸门: 人工语义的行机器永不回填.
     */
    private @NotNull Uni<Long> backfillSingle(@NotNull AiChatSession detached)
    {
        return Panache.withTransaction(
                () ->
                AiChatSession.
                    <AiChatSession>findById(detached.id).
                    flatMap(
                        session ->
                        {
                            if(session == null || session.title != null || AiChatSession.TITLE_SOURCE_MANUAL.equals(session.titleSource))
                                return Uni.createFrom().item(0L);
                            final var title = titleFromFirstUserMessage(session);
                            if(title == null || title.isEmpty())
                                return Uni.createFrom().item(0L);
                            session.title = title;
                            return session.persist().replaceWith(1L);
                        }
                    )
            ).
            onFailure().
            invoke(f -> LOG.warn("会话标题回填失败, 该会话跳过: sessionId={}, {}", detached.id, f.getMessage())).
            onFailure().recoverWithItem(() -> 0L);
    }

    /**
     * 从会话消息 JSONB 提取首条用户消息并按兜底口径截断 (确定性, 零 LLM).
     *
     * @param session 会话 (事务内受管实体)
     * @return 回填标题; 无用户消息/消息为 null 时为 {@code null} (调用方跳过, 该会话保持无标题)
     */
    private static @Nullable String titleFromFirstUserMessage(@NotNull AiChatSession session)
    {
        final var content = firstUserContent(session.messages);
        return content == null ? null : SessionTitleGenerator.fallbackTitle(content);
    }

    /**
     * 解析消息 JSONB 提取首条 user 消息 content (对话时序保序).
     *
     * @param messagesJson 会话消息 JSONB 原文
     * @return 首条用户消息 content; 空历史/仅助手/损坏 JSON 为 {@code null};
     *         损坏单点 WARN — 单会话损坏只损失该会话标题, 不阻断整体回填 (输入侧 fail-open)
     */
    private static @Nullable String firstUserContent(@Nullable String messagesJson)
    {
        if(messagesJson == null || messagesJson.isBlank())
            return null;
        try
        {
            for(final var message: JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() {}))
                if("user".equals(message.get("role")))
                    return message.get("content");
            return null;
        }
        catch(Exception e)
        {
            LOG.warn("解析会话消息失败, 该会话跳过回填: {}", e.getMessage());
            return null;
        }
    }
    //endregion

    //region 上下文跳板
    /**
     * 无上下文调用方的统一跳板: 逐次建立"安全"duplicated context 并在其事件循环上执行 Panache 链.
     *
     * @param chain 须在上下文内执行的响应式链
     * @param <T>  链的产出类型
     * @return 与链等价的发布者; 调用方线程仅做上下文搭建, 零阻塞
     * @implNote {@code SessionTitleGenerator#runWithContext} 先例的收编: 静态 Panache 解析会话强依赖
     *           被标记安全的 Vert.x context, 启动线程/JUnit 线程均无, 必须显式建链跳转;
     *           runOnContext 回调内的同步异常不会流经 emitter, 以 try-catch 兜底转为失败信号.
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
}
