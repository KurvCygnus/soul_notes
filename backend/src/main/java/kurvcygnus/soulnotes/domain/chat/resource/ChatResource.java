package kurvcygnus.soulnotes.domain.chat.resource;

import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import kurvcygnus.soulnotes.domain.chat.dto.ChatHistoryMessage;
import kurvcygnus.soulnotes.domain.chat.dto.ChatMessageVo;
import kurvcygnus.soulnotes.domain.chat.dto.ChatSendRequest;
import kurvcygnus.soulnotes.domain.chat.dto.ChatSessionVo;
import kurvcygnus.soulnotes.domain.chat.dto.SessionPinVo;
import kurvcygnus.soulnotes.domain.chat.dto.SessionRenameRequest;
import kurvcygnus.soulnotes.domain.chat.service.ChatService;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.exception.IBusinessException;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * AI 树洞对话 REST 资源, 面向 STUDENT 角色提供非流式/流式对话与会话查询端点.
 * <ul>
 *     <li>{@code POST /api/v1/chat/send} — 发送消息, 获取完整回复 (非流式)</li>
 *     <li>{@code POST /api/v1/chat/stream} — SSE 流式回复 (JSON Body)</li>
 *     <li>{@code GET  /api/v1/chat/sessions} — 历史会话列表</li>
 *     <li>{@code GET  /api/v1/chat/sessions/{sessionId}/messages} — 会话完整消息历史</li>
 *     <li>{@code POST /api/v1/chat/sessions/{sessionId}/pin} — 会话置顶翻转 (Task 8)</li>
 *     <li>{@code PUT  /api/v1/chat/sessions/{sessionId}/title} — 会话重命名 (Task 8)</li>
 * </ul>
 *
 * @implNote userId 从 JWT subject 解析 (认证由全局机制保证), 用户只能访问自己的会话.
 * @since 1.0
 */
@SuppressWarnings("JavadocDeclaration") @Path(ApiEndpointConstants.CHAT_BASE)
@RolesAllowed(UserRole.ROLE_STUDENT)
public final class ChatResource
{
    @Inject ChatService chatService;
    @Inject SecurityIdentity securityIdentity;

    //* 从 SecurityIdentity 提取当前用户 ID (即 JWT subject).
    private @NotNull UUID currentUserId() { return UUID.fromString(securityIdentity.getPrincipal().getName()); }

    /**
     * 发送消息并返回 AI 完整回复 (非流式).
     *
     * @param req 发送请求 (含可选会话 ID 与消息内容)
     * @return 助手角色的回复消息; LLM 不可用时为固定兜底文案 (同样落库)
     * @throws IBusinessException 会话 ID 不存在时 (SESSION_NOT_FOUND)
     */
    @POST @Path("/send")
    public @NotNull Uni<ApiResponse<ChatMessageVo>> send(@NotNull ChatSendRequest req) { return chatService.sendMessage(req, currentUserId()).map(ApiResponse::success); }

    /**
     * SSE 流式回复, 逐 token 推送以支持前端逐字渲染.
     * <p>流首事件恒为 meta JSON ({@code {"type":"meta","sessionId":"<uuid>"}}) 回传实际使用的会话 ID,
     * 之后为纯文本 token 事件 — 新前端据此免回查会话列表直接绑定会话; 流尾以 followups 尾随事件收口
     * ({@code {"type":"followups","items":[...]}}, 恰好 0-3 条, 候选追问的生成产物): 追问在回复落库后
     * 异步生成, 事件到达前流不收口 (token 已全部发出, 仅推迟 close), 生成失败/空产物 = 无此事件直接收流,
     * 前端以结构化判定区分契约事件与纯文本 token (与 meta 同款信封约定).</p>
     *
     * @param req 发送请求 (含可选会话 ID 与消息内容)
     * @return SSE 事件流 (text/event-stream); 流首 meta 事件 + token 事件 + 可选 followups 尾随事件,
     *         LLM 中途失败时补发固定兜底文案后正常收流
     * @throws IBusinessException 会话 ID 合法但对应会话不存在时 (SESSION_NOT_FOUND), 以流失败形式发出;
     *                            非法 UUID 格式的会话 ID 不报错, 回退为新会话
     * @since 1.5.0 (流首 meta 会话绑定事件契约); 1.8.0 (流尾 followups 尾随事件契约)
     */
    @POST @Path("/stream") @Produces(MediaType.SERVER_SENT_EVENTS)
    public @NotNull Multi<String> stream(@NotNull ChatSendRequest req)
    {
        return chatService.streamMessage(
            req.sessionId() != null ? req.sessionId().toString() : null,
            req.content(),
            currentUserId()
        );
    }

    /**
     * 获取当前用户的会话概览列表 (按最近活跃排序).
     *
     * @return 会话概览列表 (可能为空)
     */
    @GET @Path("/sessions")
    public @NotNull Uni<ApiResponse<List<ChatSessionVo>>> listSessions() { return chatService.listSessions(currentUserId()).map(ApiResponse::success); }

    /**
     * 拉取指定会话的完整消息历史 (按对话顺序, 含 LLM 回复).
     *
     * @param sessionId 会话 ID
     * @return 消息列表 (role/content, 按对话顺序; 空会话为空列表)
     * @throws IBusinessException 会话 ID 非法、不存在或不属于当前用户时 (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @since 1.2.1
     */
    @GET @Path("/sessions/{sessionId}/messages")
    public @NotNull Uni<ApiResponse<List<ChatHistoryMessage>>> listMessages(@PathParam("sessionId") @NotNull String sessionId)
    {
        return chatService.listMessages(parseSessionIdOrNotFound(sessionId), currentUserId()).map(ApiResponse::success);
    }

    /**
     * 删除指定会话 (硬删除, 含全部消息历史).
     *
     * @param sessionId 会话 ID
     * @return 空载荷的成功响应
     * @throws IBusinessException 会话 ID 非法、不存在或不属于当前用户时 (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @since 1.2.1
     */
    @DELETE @Path("/sessions/{sessionId}")
    public @NotNull Uni<ApiResponse<Void>> deleteSession(@PathParam("sessionId") @NotNull String sessionId)
    {
        return chatService.deleteSession(
            parseSessionIdOrNotFound(sessionId),
            currentUserId()
        ).map(_ -> ApiResponse.success());
    }

    /**
     * 置顶翻转指定会话 (服务端按当前态取反).
     *
     * @param sessionId 会话 ID
     * @return 翻转后的置顶时刻 ({@code pinnedAt} 为 null/缺席即已取消) — 前端不自行推断, 一律以响应落定
     * @throws IBusinessException 会话 ID 非法、不存在或不属于当前用户时 (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @since 1.9.0
     */
    @POST @Path("/sessions/{sessionId}/pin")
    public @NotNull Uni<ApiResponse<SessionPinVo>> pinSession(@PathParam("sessionId") @NotNull String sessionId)
    {
        return chatService.togglePin(parseSessionIdOrNotFound(sessionId), currentUserId()).map(ApiResponse::success);
    }

    /**
     * 重命名指定会话 (人工标题): 服务端剥离首尾空白后校验非空且不超 100 字, 成功落库并标记
     * {@code title_source='manual'} — 此后标题链 (AI 生成/启动回填) 永久豁免该会话.
     *
     * @param sessionId 会话 ID
     * @param req       重命名请求体 (含新标题)
     * @return 空载荷的成功响应 (列表展示由前端刷新/覆盖层承接)
     * @throws IBusinessException 标题空白或超长时 (BAD_REQUEST); 会话 ID 非法、不存在或不属于当前用户时
     *                            (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @since 1.9.0
     */
    @PUT @Path("/sessions/{sessionId}/title")
    public @NotNull Uni<ApiResponse<Void>> renameSession(@PathParam("sessionId") @NotNull String sessionId, @NotNull SessionRenameRequest req)
    {
        return chatService.renameSession(parseSessionIdOrNotFound(sessionId), req.title(), currentUserId()).map(_ -> ApiResponse.success());
    }

    //* 路径参数 UUID 解析: 非法格式与 "不存在" 同码同文案回应 — 不向客户端区分两种失败形态, 防会话枚举.
    private static @NotNull UUID parseSessionIdOrNotFound(@NotNull String sessionId)
    {
        try { return UUID.fromString(sessionId); }
        catch(IllegalArgumentException e)
        {
            throw IBusinessException.of(
                ErrorCode.SESSION_NOT_FOUND,
                "会话不存在",
                NoSuchElementException::new,
                "CHAT_SESSION_LOOKUP_NOT_FOUND"
            ).asException();
        }
    }
}