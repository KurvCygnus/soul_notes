package kurvcygnus.soulnotes.domain.diary.service;

import io.quarkus.hibernate.reactive.panache.common.WithTransaction;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.diary.dto.DiaryCreateRequest;
import kurvcygnus.soulnotes.domain.diary.dto.DiaryListQuery;
import kurvcygnus.soulnotes.domain.diary.dto.DiaryResponse;
import kurvcygnus.soulnotes.domain.diary.entity.MoodDiary;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.exception.IBusinessException;
import org.jetbrains.annotations.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * <b>日记业务服务</b>
 * <ul>
 *     <li>创建日记 (写入 DB → 触发 AI 分析)</li>
 *     <li>分页查询、单条查询、删除 (校验归属)</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class  DiaryService
{
    private final @NotNull EmotionAnalysisService emotionAnalysisService;

    public DiaryService(@NotNull EmotionAnalysisService emotionAnalysisService) { this.emotionAnalysisService = emotionAnalysisService; }

    //region 核心业务
    /**
     * <span style="color: 95cc6d">创建日记并触发 AI 分析.</span>
     * <ul>
     *     <li>保存日记至 DB</li>
     *     <li>异步调用 {@code MoodAnalysisAgent} 分析情感</li>
     *     <li>检测 {@code WarningDetectionAgent} 预警等级</li>
     *     <li>预警时推送 AlertWebSocket</li>
     * </ul>
     *
     * @param req    创建请求
     * @param userId 用户 ID
     * @return 创建的日记响应
     */
    @WithTransaction
    public @NotNull Uni<DiaryResponse> create(@NotNull DiaryCreateRequest req, @NotNull UUID userId)
    {
        if(req.content() == null && req.audioData() == null)
            return Uni.createFrom().failure(
                IBusinessException.of(
                    ErrorCode.BAD_REQUEST,
                    "日记内容不能为空: 至少提供 content 或 audioData 一项",
                    IllegalArgumentException::new,
                    "DIARY_CREATE_BOTH_NULL"
                ).asException()
            );

        final var diary = new MoodDiary();
        diary.userId    = userId;
        diary.content   = req.content();
        diary.audioUrl  = null; //! 语音上传流程暂未集成, 此处为占位.
        //? FIX: 语音上传流程完全未实现, audioData (Base64) 的转换/存储/清理均缺失.
        diary.createdAt = Instant.now();

        return diary.persistAndFlush().
            flatMap(v -> analyzeAndDetect(diary)).
            map(DiaryResponse::fromEntity);
    }

    /**
     * <span style="color: 95cc6d">分页查询用户日记列表.</span>
     *
     * @param query  分页查询参数
     * @param userId 用户 ID
     * @return 日记响应列表
     */
    @WithTransaction
    public @NotNull Uni<List<DiaryResponse>> listByUser(
        @NotNull DiaryListQuery query,
        @NotNull UUID userId
    )
    {
        return MoodDiary.findByUserId(userId).page(query.getPage() - 1, query.getSize()).list().
            map(
                list -> list.stream().
                    map(DiaryResponse::fromEntity).
                    toList()
            );
    }

    /**
     * <span style="color: f84b4b">查询单条日记 (校验用户归属).</span>
     *
     * @param id     日记 ID
     * @param userId 用户 ID (用于归属校验)
     * @return 日记响应
     * @throws IBusinessException 当日记不存在或不属于该用户时抛出
     */
    @SuppressWarnings("JavadocDeclaration") @WithTransaction
    public @NotNull Uni<DiaryResponse> getById(long id, @NotNull UUID userId)
    {
        return MoodDiary.findById(id).
            onItem().
            ifNull().failWith(
                () -> IBusinessException.of(
                    ErrorCode.DIARY_NOT_FOUND,
                    "日记不存在",
                    NoSuchElementException::new,
                    "DIARY_READ_RECORD_NOT_FOUND"
                ).asException()
            ).
            map(MoodDiary.class::cast).
            flatMap(
                diary -> !diary.userId.equals(userId) ?
                    Uni.createFrom().failure(
                        IBusinessException.of(
                            ErrorCode.DIARY_NOT_FOUND,
                            "无权访问此日记",
                            IllegalStateException::new,
                            "DIARY_READ_ACCESS_DENIED"
                        ).asException()
                    ) :
                    Uni.createFrom().item(DiaryResponse.fromEntity(diary))
            );
    }

    /**
     * <span style="color: f84b4b">删除日记 (校验用户归属).</span>
     *
     * @param id     日记 ID
     * @param userId 用户 ID (用于归属校验)
     * @return {@link Uni<Void>}
     */
    @WithTransaction
    public @NotNull Uni<Void> delete(long id, @NotNull UUID userId)
    {
        return MoodDiary.<MoodDiary>findById(id).
            onItem().
            ifNull().failWith(
                () -> IBusinessException.of(
                    ErrorCode.DIARY_NOT_FOUND,
                    "日记不存在",
                    NoSuchElementException::new,
                    "DIARY_DELETE_RECORD_NOT_FOUND"
                ).asException()
            ).
            flatMap(
                diary -> !diary.userId.equals(userId) ?
                    Uni.createFrom().failure(
                        IBusinessException.of(
                            ErrorCode.DIARY_NOT_FOUND,
                            "无权删除此日记",
                            IllegalStateException::new,
                            "DIARY_DELETE_ACCESS_DENIED"
                        ).asException()
                    ) :
                    diary.delete()
            );
    }
    //endregion

    //region AI 分析
    //* 委托 EmotionAnalysisService 执行 AI 情感分析与预警检测.
    private @NotNull Uni<MoodDiary> analyzeAndDetect(@NotNull MoodDiary diary) { return emotionAnalysisService.analyzeAsync(diary); }
    //endregion
}