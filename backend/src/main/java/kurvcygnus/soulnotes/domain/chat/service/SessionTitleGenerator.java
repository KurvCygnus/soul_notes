package kurvcygnus.soulnotes.domain.chat.service;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.vertx.core.runtime.context.VertxContextSafetyToggle;
import io.smallrye.common.vertx.VertxContext;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.ai.agent.SessionTitleAgent;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.util.UUID;
import java.util.function.Supplier;

/**
 * 会话标题生成器: 会话首轮交换完成后, 依据首条用户消息 + 助手回复调 LLM 生成短标题并落库
 * (fire-and-forget, 不阻塞对话主链路), 对齐商用 AI 对话的会话命名体验.
 *
 * @implNote <b>fail-open 语义</b>: LLM 失败一律降级为兜底标题 (首条用户消息截断 20 字) 落库;
 *           LLM 空白回复/兜底仍为空串时不落库 (读取端以预览兜底); 落库失败仅 WARN, 绝不向外抛错 —
 *           标题是锦上添花内容, 不允许拖垮对话流.
 *           <b>线程纪律</b>: 挂点线程 (事件循环/langchain4j 流式回调) 普遍没有"安全" Vert.x 上下文,
 *           Panache 会话操作在该线程直接执行会同步抛 "No current Vertx context" — 链式执行统一经
 *           {@link #runWithContext} 逐次建立安全 duplicated context 跳板 (DailySummaryGenerator 先例),
 *           阻塞 LLM 调用再经 {@code vertx.executeBlocking} 切 worker 线程 (HR000068/069, ChatService 同款);
 *           外层只暴露非阻塞 Uni, 挂点线程零阻塞.
 * @since 1.6.0
 */
@SuppressWarnings("unused")//! AI Agent 为 Quarkus 运行时生成 Bean, IDE 静态分析误报注入点未满足依赖 (DailySummaryGenerator 同款先例).
@ApplicationScoped
public final class SessionTitleGenerator
{
    private static final @NotNull Logger LOG = PrintUtils.getLogger();

    //* 落库标题硬上限 (字): 提示词侧 16 字软约束的兜底; 兜底标题 (用户消息截断) 同用此上限.
    static final int TITLE_MAX_CHARS = 20;

    //region 注入
    private final @NotNull SessionTitleAgent agent;
    private final @NotNull Vertx vertx;

    public SessionTitleGenerator(@NotNull SessionTitleAgent agent, @NotNull Vertx vertx)
    {
        this.agent = agent;
        this.vertx = vertx;
    }
    //endregion

    //region 生成链路
    /**
     * fire-and-forget 入口: 订阅即弃, 供对话链路挂点调用 (恒不向外抛错).
     *
     * @param sessionId      会话 ID
     * @param userContent    首条用户消息原文
     * @param assistantReply 首条助手回复 (落库文本)
     */
    public void fire(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String assistantReply)
    {
        generateFor(sessionId, userContent, assistantReply).
            subscribe().
            with(
                v -> {},
                t -> LOG.warn("会话标题生成执行失败 (订阅级兜底): sessionId={}, {}", sessionId, t.getMessage())
            );
    }

    /**
     * 生成链路的唯一收口 (fire 与测试共用).
     *
     * @return 完成信号; 恒成功完成 (任何失败已内部降级为兜底标题或 WARN 跳过, fail-open)
     */
    public @NotNull Uni<Void> generateFor(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String assistantReply)
    {
        return runWithContext(() -> generatePipeline(sessionId, userContent, assistantReply));
    }

    /**
     * 生成链本体 (须在安全 duplicated context 内执行): 阻塞 LLM (worker) → 归一化 (失败转兜底) → 幂等落库.
     *
     * @return 完成信号
     */
    private @NotNull Uni<Void> generatePipeline(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String assistantReply)
    {
        //* HR000068/069: 阻塞 LLM 调用必须经 executeBlocking 在 worker 线程执行,
        //* 结果回事件循环后再续 Panache 链 — 直接在本上下文调用会阻塞事件循环.
        return vertx.executeBlocking(
                () -> agent.generateTitle(AiPromptConstants.SESSION_TITLE_SYSTEM_PROMPT, userContent, assistantReply),
                false
            ).
            //* AI 失败同样兜底: 以首条用户消息截断为标题落库 (fail-open 契约: 首轮交换后尽量有标题可展示).
            onFailure().
            invoke(f -> LOG.warn("会话标题 LLM 生成失败, 降级兜底标题: sessionId={}, {}", sessionId, f.getMessage())).
            onFailure().recoverWithItem(f -> fallbackTitle(userContent)).
            onItem().transform(reply ->
            {
                //* LLM 空白回复转兜底标题; 兜底亦为空串 (空用户消息) 时调用方跳过落库 (读取端以预览兜底).
                final var normalized = normalizedTitle(reply);
                return normalized != null ? normalized : fallbackTitle(userContent);
            }).
            flatMap(title -> title.isEmpty() ? Uni.createFrom().voidItem() : Panache.withTransaction(() -> persistTitle(sessionId, title)));
    }

    /**
     * 无上下文调用方的统一跳板: 逐次建立"安全"duplicated context 并在其事件循环上执行 Panache 链.
     *
     * @param chain 须在上下文内执行的响应式链
     * @param <T>  链的产出类型
     * @return 与链等价的发布者; 调用方线程仅做上下文搭建, 零阻塞
     * @implNote {@code DailySummaryGenerator#runWithContext} 先例的收编: 静态 Panache 解析会话强依赖
     *           被标记安全的 Vert.x context, 挂点线程/JUnit 线程均无, 必须显式建链跳转;
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

    //region 归一化与兜底
    /**
     * 归一化 LLM 回复: 剥离首尾空白与成对包裹引号; 纯空白拒绝; 超长截断封顶.
     *
     * @param reply LLM 原始回复
     * @return 可落库标题; 纯空白为 {@code null} (调用方转兜底标题)
     */
    static @Nullable String normalizedTitle(@NotNull String reply)
    {
        final var stripped = unwrapQuotes(reply.strip());
        if(stripped.isEmpty())
            return null;
        return truncate(stripped, TITLE_MAX_CHARS);
    }

    /**
     * 兜底标题: 首条用户消息剥离首尾空白后截断封顶 (AI 失败时的 fail-open 落库内容).
     *
     * @param userMessage 首条用户消息原文
     * @return 兜底标题 (可能为空串, 调用方对空串不落库)
     */
    static @NotNull String fallbackTitle(@NotNull String userMessage)
    {
        return truncate(userMessage.strip(), TITLE_MAX_CHARS);
    }

    //* 仅剥离一层成对包裹引号 (半角双/单引号与中文弯引号): 模型偶发把标题包进引号, 内层引号属标题内容.
    private static @NotNull String unwrapQuotes(@NotNull String text)
    {
        if(text.length() < 2)
            return text;
        final var first = text.charAt(0);
        final var last  = text.charAt(text.length() - 1);
        final var paired = (first == '"' && last == '"') || (first == '\'' && last == '\'') || (first == '“' && last == '”');
        return paired ? text.substring(1, text.length() - 1).strip() : text;
    }

    //* 定长截断: 中文场景按 char 切分即可 (标题内容为 BMP 字符), 不做代理对补齐的过度设计 (DailySummaryGenerator 同款).
    private static @NotNull String truncate(@NotNull String text, int max)
    {
        return text.length() <= max ? text : text.substring(0, max);
    }
    //endregion

    //region 落库
    /**
     * 标题落库 (须在事务内执行, 事务由 {@code generatePipeline} 的 withTransaction 外壳开启):
     * 仅当当前标题仍为 null 时写入 — 幂等守卫, 并发/重放链路不覆写既有标题; 会话已被删除则静默跳过.
     *
     * @implNote 读改写收敛进单事务: 实体出事务即分离, 再 persist 会退化为同 id 重 INSERT (ChatService 实测先例).
     */
    private static @NotNull Uni<Void> persistTitle(@NotNull UUID sessionId, @NotNull String title)
    {
        return AiChatSession.<AiChatSession>findById(sessionId).
            flatMap(session ->
            {
                if(session == null || session.title != null)
                    return Uni.createFrom().voidItem();
                session.title = title;
                return session.persist().replaceWithVoid();
            });
    }
    //endregion
}
