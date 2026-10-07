package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.vertx.core.runtime.context.VertxContextSafetyToggle;
import io.smallrye.common.vertx.VertxContext;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import kurvcygnus.soulnotes.ai.agent.FollowupAgent;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.utils.JsonUtils;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;

import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * 候选追问生成器: 每轮 AI 回复落库后, 依据本轮用户消息 + AI 回复调 LLM 生成 3 条用户最可能的追问,
 * 追加至最近一条 assistant 消息落库 (fire-and-forget, 不阻塞对话主链路), SSE 流路径另以尾随事件透传.
 *
 * @implNote <b>fail-open 语义</b>: LLM 失败/解析失败/数量不为 3 一律降级为空列表 — 不落库不发事件,
 *           聊天流绝不受影响; 落库失败仅 WARN (本次 SSE 产物仍透传, 历史回放缺失可接受) —
 *           追问是锦上添花内容, 不允许拖垮对话流.
 *           <b>线程纪律</b>: 与 {@code SessionTitleGenerator} 同款 — 链式执行统一经
 *           {@link #runWithContext} 逐次建立安全 duplicated context 跳板, 阻塞 LLM 调用再经
 *           {@code vertx.executeBlocking} 切 worker 线程 (HR000068/069); 外层只暴露非阻塞 Uni,
 *           挂点线程零阻塞.
 *           <b>安全边界</b>: 追问请求的 system prompt 恒为内置追问提示词, <b>一律不注入用户聊天风格块</b>
 *           (chat-style, P2 Task 1) — 追问是系统生成的引导性内容, 用户措辞偏好仅作用于共情倾听主链路.
 * @since 1.8.0
 */
@SuppressWarnings("unused")//! AI Agent 为 Quarkus 运行时生成 Bean, IDE 静态分析误报注入点未满足依赖 (SessionTitleGenerator 同款先例).
@ApplicationScoped
public final class FollowupGenerator
{
    private static final @NotNull Logger LOG = PrintUtils.getLogger();

    //* 追问条数硬契约: 数量 != 3 的 LLM 产物整组拒绝 (SSE 契约"恰好 0-3 条"中的满档), 提示词侧 3 条为软约束.
    static final int FOLLOWUP_COUNT = 3;

    //region 注入
    private final @NotNull FollowupAgent agent;
    private final @NotNull Vertx vertx;

    public FollowupGenerator(@NotNull FollowupAgent agent, @NotNull Vertx vertx)
    {
        this.agent = agent;
        this.vertx = vertx;
    }
    //endregion

    //region 生成链路
    /**
     * fire-and-forget 入口: 订阅即弃, 供非流式对话链路挂点调用 (恒不向外抛错).
     *
     * @param sessionId      会话 ID
     * @param userContent    本轮用户消息原文
     * @param assistantReply 本轮助手回复 (落库文本)
     */
    public void fire(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String assistantReply)
    {
        generateFor(sessionId, userContent, assistantReply).
            subscribe().
            with(
                v -> {},
                t -> LOG.warn("候选追问生成执行失败 (订阅级兜底): sessionId={}, {}", sessionId, t.getMessage())
            );
    }

    /**
     * 生成链路的唯一收口 (fire 与流路径尾随事件共用).
     *
     * @return 本轮追问产物 (0 或 3 条); 恒成功完成 (任何失败已内部降级为空列表或 WARN 跳过, fail-open)
     * @implNote 收口在收口层而非管线内: generatePipeline 的失败分支 (上下文跳板同步建链异常等) 也必须
     *           兑现 "恒成功" 类头契约 — 尾随事件订阅方 (fireFollowupsTrailing) 依赖该契约保证收流,
     *           此处 recover 为空列表即与 "生成失败 = 无事件" 的 SSE 语义严格一致.
     */
    public @NotNull Uni<List<String>> generateFor(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String assistantReply)
    {
        return runWithContext(() -> generatePipeline(sessionId, userContent, assistantReply)).
            onFailure().
            recoverWithItem(List.of());//! 订阅级漏网失败 (建链/跳板异常) 收口为空产物, 兑现恒成功契约, 绝不让聊天流悬挂.
    }

    /**
     * 生成链本体 (须在安全 duplicated context 内执行): 阻塞 LLM (worker) → 解析容错 (失败转空) → 追加落库.
     *
     * @return 本轮追问产物 (0 或 3 条)
     */
    private @NotNull Uni<List<String>> generatePipeline(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String assistantReply)
    {
        //* HR000068/069: 阻塞 LLM 调用必须经 executeBlocking 在 worker 线程执行,
        //* 结果回事件循环后再续 Panache 链 — 直接在本上下文调用会阻塞事件循环.
        return vertx.executeBlocking(
                () -> agent.generateFollowups(AiPromptConstants.FOLLOWUP_SYSTEM_PROMPT, userContent, assistantReply),
                false
            ).
            onFailure().
            invoke(f -> LOG.warn("候选追问 LLM 生成失败, 本轮跳过追问: sessionId={}, {}", sessionId, f.getMessage())).
            onItem().transform(FollowupGenerator::parseFollowups).
            flatMap(items ->
            {
                if(items.isEmpty())
                    return Uni.createFrom().item(items);
                //* 落库失败不吞产物: 追问仍随 SSE 透传本次会话 (前端已展示, 历史回放缺失可接受).
                return Panache.withTransaction(() -> persistFollowups(sessionId, items)).
                    onItem().transform(v -> items).
                    onFailure().invoke(f -> LOG.warn("候选追问落库失败, 仅本次透传: sessionId={}, {}", sessionId, f.getMessage())).
                    onFailure().recoverWithItem(f -> items);
            });
    }

    /**
     * 调用方上下文内的嵌套跳板: 以调用方当前 context 为父新建"安全"嵌套 duplicated context,
     * 并在其事件循环上执行 Panache 链 (与无上下文调用方的 getOrCreate 跳板不同源, 见 implNote).
     *
     * @param chain 须在上下文内执行的响应式链
     * @param <T>  链的产出类型
     * @return 与链等价的发布者; 调用方线程仅做上下文搭建, 零阻塞
     * @implNote 必须强制"新建嵌套"上下文而非 {@code getOrCreateDuplicatedContext}: 后者在挂点已处于
     *           duplicated context 时原样返回同一上下文, 而标题/追问两条生成链恰从同一挂点并行触发
     *           (send 的 invoke 块) — 共享上下文即共享 HR 会话槽位, 两个 findById 的结果处理状态互踩
     *           直接抛 "Illegal pop()" (集成测试实证); 新建嵌套上下文 (locals 自父复制, 写入不回传)
     *           使每条生成链持有独立会话槽位. 前提是调用方已有 context (挂点恒在请求链上, 成立);
     *           无上下文线程不适用本方法, 勿混用于调度链 (DailySummaryGenerator 的 getOrCreate 形态彼处自洽).
     */
    private <T> @NotNull Uni<T> runWithContext(@NotNull Supplier<? extends @NotNull Uni<T>> chain)
    {
        final var duplicated = VertxContext.createNewDuplicatedContext(vertx.getDelegate().getOrCreateContext());
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

    //region 解析容错
    /**
     * 解析 LLM 回复中的追问 JSON 数组 (解析容错).
     *
     * @param reply LLM 原始回复 (可为 {@code null})
     * @return 恰好 3 条的追问列表; 解析失败/数量不为 3/含空白条目一律为空列表
     *         (fail-open: 调用方对空列表整组跳过, 不落库不发事件)
     * @implNote 提取首个 {@code '['} 到最后一个 {@code ']'} 的子串再解析: 兜住说明文字包裹与
     *           代码块围栏包裹两种常见偏离; 类型不符 (JSON 对象) 同样落入解析失败分支整组拒绝.
     * @since 1.8.0
     */
    static @NotNull List<String> parseFollowups(@Nullable String reply)
    {
        //* null 回复按失败同语义拒绝 (转空列表): 模型偶发空 content 成功返回, 归一化若 NPE
        //! 会夭折整条生成链 — 与 SessionTitleGenerator#normalizedTitle 的 null 防御同款教训.
        if(reply == null)
            return List.of();
        final var start = reply.indexOf('[');
        final var end   = reply.lastIndexOf(']');
        if(start < 0 || end <= start)
            return List.of();
        try
        {
            final var items = JsonUtils.parseJson(reply.substring(start, end + 1), new TypeReference<List<String>>() { });
            final var cleaned = items.stream().map(String::strip).filter(s -> !s.isEmpty()).toList();
            return cleaned.size() == FOLLOWUP_COUNT ? cleaned : List.of();
        }
        catch(RuntimeException e)
        {
            LOG.warn("候选追问解析失败, 本轮跳过追问: {}", e.getMessage());
            return List.of();//! 截断/类型不符等解析异常整组拒绝, 绝不向外抛出.
        }
    }
    //endregion

    //region 落库
    /**
     * 追问落库 (须在事务内执行, 事务由 {@code generatePipeline} 的 withTransaction 外壳开启):
     * 追加至最近一条 assistant 消息; 会话已被删除或无 assistant 消息 (历史被截断) 时静默跳过.
     *
     * @implNote 读改写收敛进单事务: 实体出事务即分离, 再 persist 会退化为同 id 重 INSERT (ChatService 实测先例).
     *           并发窗口说明: 上一轮追问迟到落库会与本轮产物竞争"最近一条 assistant 消息", 后写者胜 —
     *           追问属最佳努力引导内容, 串轮错挂可接受 (标题落库有幂等守卫, 追问每轮刷新, 语义不同).
     *           //! 读取必须为 {@code PESSIMISTIC_WRITE} 锁定读: 标题生成器与本生成器从同一挂点并行触发,
     *           //! 对同一会话行并发"读-改-写"整行更新 — 普通读会让后提交者以陈旧快照覆写先提交者的列
     *           //! (丢失更新, 标题被抹回 null, 集成测试实证); FOR UPDATE 使两链的读改写在此处串行化.
     */
    private static @NotNull Uni<Void> persistFollowups(@NotNull UUID sessionId, @NotNull List<String> items)
    {
        return AiChatSession.<AiChatSession>findById(sessionId, LockModeType.PESSIMISTIC_WRITE).
            flatMap(session ->
            {
                if(session == null || !session.attachFollowupsToLastAssistant(items))
                    return Uni.createFrom().voidItem();
                return session.persist().replaceWithVoid();
            });
    }
    //endregion
}
