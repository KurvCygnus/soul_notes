package kurvcygnus.soulnotes.domain.chat.resource;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import kurvcygnus.soulnotes.domain.chat.dto.ChatStyleRequest;
import kurvcygnus.soulnotes.domain.chat.dto.ChatStyleVo;
import kurvcygnus.soulnotes.domain.chat.entity.UserChatStyle;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.exception.IBusinessException;
import kurvcygnus.soulnotes.exception.StructuredException;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.UUID;

/**
 * 用户聊天风格 REST 资源, 面向 STUDENT 角色提供五轴表达偏好的读写.
 * <ul>
 *     <li>{@code GET /api/v1/me/chat-style} — 读取五轴偏好 (无行返回全 default)</li>
 *     <li>{@code PUT /api/v1/me/chat-style} — 全量更新五轴偏好 (白名单校验, 幂等 upsert)</li>
 * </ul>
 *
 * @implNote userId 从 JWT subject 解析 (认证由全局机制保证), 用户只能访问自己的风格行.
 *           偏好仅约束共情对话的措辞与格式 — 预警检测/标题/追问/咨询员标签链一律不读该数据.
 * @since 2.1.0
 */
@SuppressWarnings("JavadocDeclaration") @Path(ApiEndpointConstants.ME_BASE)
@RolesAllowed(UserRole.ROLE_STUDENT)
public final class ChatStyleResource
{
    @Inject SecurityIdentity securityIdentity;

    //* 从 SecurityIdentity 提取当前用户 ID (即 JWT subject).
    private @NotNull UUID currentUserId() { return UUID.fromString(securityIdentity.getPrincipal().getName()); }

    /**
     * 读取当前用户的五轴聊天风格.
     *
     * @return 五轴偏好; 无行时五轴全 default (缺省语义收口在 VO 层, 不懒建行)
     */
    @GET
    @Path("/chat-style")
    @Produces(MediaType.APPLICATION_JSON)
    public @NotNull Uni<ApiResponse<ChatStyleVo>> get()
    {
        return Panache.withTransaction(
            () -> UserChatStyle.<UserChatStyle>findById(currentUserId())
        ).map(style -> ApiResponse.success(style == null ? ChatStyleVo.defaults() : ChatStyleVo.of(style)));
    }

    /**
     * 全量更新当前用户的五轴聊天风格 (幂等 upsert).
     *
     * @param req 五轴写入请求 (全量 PUT, 五轴缺一不可)
     * @return 落定后的五轴偏好
     * @throws IBusinessException 任一轴取值越白名单 (含 null/空白) 时 (BAD_REQUEST)
     */
    @PUT
    @Path("/chat-style")
    @Produces(MediaType.APPLICATION_JSON)
    public @NotNull Uni<ApiResponse<ChatStyleVo>> update(@NotNull ChatStyleRequest req)
    {
        validate(req);
        final var userId = currentUserId();
        return Panache.withTransaction(
            () ->
            UserChatStyle.<UserChatStyle>findById(userId).
                onItem().ifNull().continueWith(() -> newRow(userId)).
                invoke(style -> style.applyAxes(req.style(), req.warmth(), req.enthusiasm(), req.headings(), req.emoji())).
                chain(style -> style.persist().replaceWith(ChatStyleVo.of(style)))
        ).map(ApiResponse::success);
    }

    //region 辅助方法
    //* 五轴白名单校验: 校验先于任何寻址/落库 — 非法输入零副作用 (无行用户发非法值也不建行).
    //* 先判 null: 不可变白名单 List.of 的 contains(null) 会直接 NPE (缺字段反序列化为 null 的必经路径).
    private static void validate(@NotNull ChatStyleRequest req)
    {
        if(req.style() == null || !UserChatStyle.STYLE_VALUES.contains(req.style()))
            throw illegalAxis("style", req.style(), UserChatStyle.STYLE_VALUES);
        if(req.warmth() == null || !UserChatStyle.TRI_STATE_VALUES.contains(req.warmth()))
            throw illegalAxis("warmth", req.warmth(), UserChatStyle.TRI_STATE_VALUES);
        if(req.enthusiasm() == null || !UserChatStyle.TRI_STATE_VALUES.contains(req.enthusiasm()))
            throw illegalAxis("enthusiasm", req.enthusiasm(), UserChatStyle.TRI_STATE_VALUES);
        if(req.headings() == null || !UserChatStyle.TRI_STATE_VALUES.contains(req.headings()))
            throw illegalAxis("headings", req.headings(), UserChatStyle.TRI_STATE_VALUES);
        if(req.emoji() == null || !UserChatStyle.TRI_STATE_VALUES.contains(req.emoji()))
            throw illegalAxis("emoji", req.emoji(), UserChatStyle.TRI_STATE_VALUES);
    }

    //* 单轴非法的统一 400 形态: 值域白名单随消息透出, null (缺字段) 同样走此路径 (contains(null) 恒 false).
    private static @NotNull StructuredException illegalAxis(@NotNull String axis, @Nullable String value, @NotNull List<String> whitelist)
    {
        return IBusinessException.of(
            ErrorCode.BAD_REQUEST,
            PrintUtils.quickFormat("{} 取值非法: {}, 允许的取值: {}", axis, value, whitelist),
            IllegalArgumentException::new,
            "CHAT_STYLE_INVALID_AXIS"
        ).asException();
    }

    //* 新建风格行: 主键即 userId, 五轴在 applyAxes 落定 (字段默认值仅为实体显式初始化).
    private static @NotNull UserChatStyle newRow(@NotNull UUID userId)
    {
        final var row = new UserChatStyle();
        row.userId = userId;
        return row;
    }
    //endregion
}
