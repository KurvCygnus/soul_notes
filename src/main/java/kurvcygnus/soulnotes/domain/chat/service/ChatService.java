package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import io.quarkus.hibernate.reactive.panache.common.WithTransaction;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.chat.dto.ChatMessageVo;
import kurvcygnus.soulnotes.domain.chat.dto.ChatSendRequest;
import kurvcygnus.soulnotes.domain.chat.dto.ChatSessionVo;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.exception.IBusinessException;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.utils.JsonUtils;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * <b>AI 对话服务</b>
 * <ul>
 *     <li>发送消息 (同步 + SSE 流式)</li>
 *     <li>会话历史管理</li>
 *     <li>预警检测与推送</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class ChatService
{
    private static final Logger LOG = LoggerFactory.getLogger(ChatService.class);

    //region 核心业务
    /**
     * <span style="color: 95cc6d">发送消息并获取完整回复 (非流式).</span>
     * <ul>
     *     <li>加载/创建 Session</li>
     *     <li>追加用户消息</li>
     *     <li>调用 {@code EmpatheticChatAgent} 获取 AI 回复</li>
     *     <li>检测预警等级</li>
     *     <li>保存 Session</li>
     * </ul>
     *
     * @param req    发送请求
     * @param userId 用户 ID
     * @return AI 回复消息
     */
    @WithTransaction
    public @NotNull Uni<ChatMessageVo> sendMessage(@NotNull ChatSendRequest req, @NotNull UUID userId)
    {
        return getOrCreateSession(req.sessionId(), userId).
            flatMap(session ->
                {
                    session.addMessage("user", req.content());
                    return callAiAndRespond(session, req.content());
                }
            ).
            map(reply -> new ChatMessageVo("assistant", reply, Instant.now()));
    }

    /**
     * <span style="color: 95cc6d">SSE 流式回复.</span>
     * <p>返回 {@link Multi<String>} 以支持前端的逐字渲染.</p>
     *
     * @param sessionId 会话 ID
     * @param content   用户消息
     * @param userId    用户 ID
     * @return AI 回复的流式块
     */
    //! @WithTransaction 不可用于 Multi 返回类型, 事务仅在 Uni 上受支持.
    //? Phase 3 如需事务保证, 应将流式响应拆为: 事务内保存消息 → 非事务流式返回 AI 回复.
    public @NotNull Multi<String> streamMessage(
        @org.jetbrains.annotations.Nullable String sessionId,
        @NotNull String content,
        @NotNull UUID userId
    )
    {
        final var sid = sessionId != null ? UUID.fromString(sessionId) : null;
        return getOrCreateSession(sid, userId).
            flatMap(session ->
                {
                    session.addMessage("user", content);
                    //? TODO Phase 3: 调用 EmpatheticChatAgent 获取流式回复
                    return Uni.createFrom().item("(SSE 流式回复待实现)");
                }
            ).
            toMulti();
    }

    /**
     * <span style="color: 95cc6d">用户历史会话概览.</span>
     *
     * @param userId 用户 ID
     * @return 会话概览列表
     */
    @WithTransaction
    public @NotNull Uni<List<ChatSessionVo>> listSessions(@NotNull UUID userId)
    {
        return AiChatSession.findByUserId(userId).
            map(sessions -> sessions.stream().
                map(
                    s -> new ChatSessionVo(
                        s.id,
                        countMessages(s.messages),
                        s.updatedAt,
                        getPreview(s.messages)
                    )
                ).toList()
            );
    }
    //endregion

    //region 辅助方法
    //* 加载已有 Session, 或创建新的 Session.
    private static @NotNull Uni<AiChatSession> getOrCreateSession(UUID sessionId, @NotNull UUID userId)
    {
        if(sessionId == null)
        {
            final var session   = new AiChatSession();
            session.id               = UUID.randomUUID();
            session.userId           = userId;
            session.messages         = "[]";
            session.warningTriggered = false;
            session.updatedAt        = Instant.now();
            return session.persist().replaceWith(session);
        }
        return AiChatSession.
            <AiChatSession>findById(sessionId).
            onItem().
            ifNull().
            failWith(
                () -> IBusinessException.of(
                    ErrorCode.SESSION_NOT_FOUND,
                    "会话不存在",
                    NoSuchElementException::new,
                    "CHAT_SESSION_LOOKUP_NOT_FOUND"
                ).asException()
            );
    }

    //* AI 对话占位实现.
    //! Phase 3 将替换为实际 EmpatheticChatAgent 调用.
    private static @NotNull Uni<String> callAiAndRespond(@NotNull AiChatSession session, @NotNull String content)
    {
        //? TODO Phase 3: 调用 EmpatheticChatAgent.chat(history, content)
        //? TODO Phase 3: 追加 AI 回复到 Session
        //? TODO Phase 3: 检测预警并推送
        final var reply = "(AI 回复待集成 — 你说了: " + content + ")";
        session.addMessage("assistant", reply);
        return session.persist().replaceWith(reply);
    }

    //* 使用 JsonUtils 解析 messages JSON 数组, 返回消息条数.
    private static int countMessages(String messagesJson)
    {
        if(messagesJson == null || messagesJson.isBlank())
            return 0;
        try
        {
            return JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() { }).size();
        }
        catch(Exception e) { LOG.warn("解析 messages JSON 获取消息数失败: {}", e.getMessage()); return 0; }
    }

    //* 使用 JsonUtils 解析 messages JSON 数组, 提取最后一条消息的 content 作为预览.
    //* 空字符串 "" 是合理选择, 用于 VO 展示前端, 表示"无预览内容".
    //! 不应使用 null (导致前端判空) 或 Optional (VO 字段不应包装 Optional).
    private static @NotNull String getPreview(String messagesJson)
    {
        if(messagesJson == null || messagesJson.isBlank())
            return "";
        try
        {
            final var messages = JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() { });
            if(messages.isEmpty())
                return "";
            final var lastContent = messages.getLast().get("content");
            if(lastContent == null || lastContent.isBlank())
                return "";
            return lastContent.length() > 50 ? lastContent.substring(0, 50) + "..." : lastContent;
        }
        catch(Exception e) { LOG.warn("解析 messages JSON 获取预览失败: {}", e.getMessage()); return ""; }
    }

    //endregion
}