package kurvcygnus.soulnotes.domain.voice.resource;

import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.infrastructure.Infrastructure;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import kurvcygnus.soulnotes.domain.voice.dto.AsrCallbackRequest;
import kurvcygnus.soulnotes.domain.voice.dto.VoiceUploadResponse;
import kurvcygnus.soulnotes.domain.voice.service.AsrTranscriptionService;
import kurvcygnus.soulnotes.domain.voice.service.VoiceStorageService;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.UUID;

/**
 * <b>语音处理 REST 资源</b>
 * <ul>
 *     <li>{@code POST /api/v1/voice/upload} — 上传语音文件</li>
 *     <li>{@code GET  /api/v1/voice/files/{fileId}} — 获取已存储的语音文件</li>
 *     <li>{@code POST /api/v1/voice/asr-callback} — 接收 ASR 转录回调 (外部服务, 免认证)</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@Path(ApiEndpointConstants.VOICE_BASE)
@RolesAllowed(UserRole.ROLE_STUDENT)
public final class VoiceResource
{
    private static final Logger LOG = LoggerFactory.getLogger(VoiceResource.class);

    @Inject VoiceStorageService voiceStorageService;
    @Inject AsrTranscriptionService asrTranscriptionService;

    /**
     * <span style="color: 95cc6d">上传语音文件.</span>
     * <p>接收 multipart 文件, 存储后触发 ASR 转录 (异步).</p>
     * <p>文件 I/O 整体移交 worker 线程池, 避免阻塞事件循环.</p>
     *
     * @param file 上传的语音文件
     * @return 上传响应
     */
    @POST @Path("/upload")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    //! item supplier 实际在 runSubscriptionOn(worker) 后的 worker 线程执行, 非事件循环.
    @SuppressWarnings("BlockingMethodInNonBlockingContext")
    public @NotNull Uni<ApiResponse<VoiceUploadResponse>> upload(@RestForm("file") @NotNull FileUpload file)
    {
        final var fileName = file.fileName();
        final var path     = file.uploadedFile();

        //! uploadedFile() returns a Path to the temp file; 延迟到 worker 池再打开, 避免事件循环做文件 I/O.
        return Uni.createFrom().item(() ->
                {
                    try { return voiceStorageService.store(fileName, java.nio.file.Files.newInputStream(path)); }
                    catch(IOException e) { throw new RuntimeException("无法读取上传文件", e); }
                }
            ).
            flatMap(u -> u).
            runSubscriptionOn(Infrastructure.getDefaultWorkerPool()).
            onItem().invoke(resp ->
                asrTranscriptionService.dispatchTranscription(resp.fileId(), resp.audioUrl()).
                    subscribe().with(
                        v -> {},
                        f -> LOG.warn("ASR 转录分发失败: {}", f.getMessage())
                    )
            ).
            map(ApiResponse::success);
    }

    /**
     * <span style="color: 95cc6d">获取已存储的语音文件.</span>
     * <p>fileId 由服务端生成 (UUID), 通过 {@link UUID#fromString} 校验防止路径穿越.</p>
     *
     * @param fileId 文件唯一标识
     * @return 文件内容, 不存在时返回 404
     */
    @GET @Path("/files/{fileId}")
    public @NotNull Uni<Response> getFile(@PathParam("fileId") @NotNull String fileId)
    {
        //! fileId 非 UUID 时拒绝, 防止路径穿越到 storagePath 之外.
        try { UUID.fromString(fileId); }
        catch(IllegalArgumentException e)
        {
            return Uni.createFrom().item(Response.status(Response.Status.NOT_FOUND).build());
        }

        return voiceStorageService.load(fileId).map(bytes ->
            bytes == null ?
                Response.status(Response.Status.NOT_FOUND).build() :
                Response.ok(bytes, MediaType.APPLICATION_OCTET_STREAM).build()
        );
    }

    /**
     * <span style="color: 95cc6d">接收 ASR 服务回调.</span>
     * <p>外部 ASR 服务在完成转录后调用此接口推送结果.</p>
     * <p>当前仅记录日志, 后续可扩展为自动创建 Diary.</p>
     *
     * @param req ASR 回调请求体
     * @return 空响应
     */
    //? ASR 回调由外部服务发起, 生产环境应使用 API Key 或 IP 白名单鉴权, 故此处使用 @PermitAll 免认证.
    @POST @Path("/asr-callback") @PermitAll
    public @NotNull Uni<ApiResponse<Void>> handleAsrCallback(@NotNull AsrCallbackRequest req)
    {
        return asrTranscriptionService.handleResult(req.fileId(), req.transcribedText(), req.status()).
            map(v -> ApiResponse.success());
    }
}
