package kurvcygnus.soulnotes.domain.diary.service;

import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.infrastructure.Infrastructure;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.ai.agent.MoodAnalysisAgent;
import kurvcygnus.soulnotes.ai.agent.WarningDetectionAgent;
import kurvcygnus.soulnotes.ai.dto.MoodAnalysisResult;
import kurvcygnus.soulnotes.ai.dto.WarningDetectionResult;
import kurvcygnus.soulnotes.domain.diary.entity.MoodDiary;
import kurvcygnus.soulnotes.utils.JsonUtils;
import kurvcygnus.soulnotes.utils.PrintUtils;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;

import java.util.LinkedHashMap;

/**
 * <b>情感分析服务</b>
 * <ul>
 *     <li>封装 AI {@code MoodAnalysisAgent} 与 {@code WarningDetectionAgent} 的调用编排</li>
 *     <li>分析结果回写 {@link MoodDiary#analysisResult} JSONB 字段</li>
 * </ul>
 *
 * @author Claude Code
 * @since 2.0
 */
@ApplicationScoped
public final class EmotionAnalysisService
{
    private static final @NotNull Logger LOG = PrintUtils.getLogger();

    private final @NotNull MoodAnalysisAgent moodAnalysisAgent;
    private final @NotNull WarningDetectionAgent warningDetectionAgent;

    public EmotionAnalysisService(
        @NotNull MoodAnalysisAgent moodAnalysisAgent,
        @NotNull WarningDetectionAgent warningDetectionAgent
    )
    {
        this.moodAnalysisAgent = moodAnalysisAgent;
        this.warningDetectionAgent = warningDetectionAgent;
    }

    /**
     * <span style="color: 95cc6d">异步情感分析 (不阻塞主流程, 用户无需等待).</span>
     * <p>适用于创建日记等场景 — 先保存 Diary, 后台线程执行 AI 分析, 完成后再回写结果.</p>
     *
     * <span style="color: f84b4b">AI 调用是同步 HTTP 请求, 通过 {@code runSubscriptionOn} 移交 worker 线程池,
     * 避免阻塞事件循环.</span>
     *
     * @param diary 已持久化的日记实体
     * @return 更新后的日记实体 (含 analysisResult)
     */
    public @NotNull Uni<MoodDiary> analyzeAsync(@NotNull MoodDiary diary)
    {
        return analyzeAndDetect(diary).
            runSubscriptionOn(Infrastructure.getDefaultWorkerPool()).
            chain(d -> d.persistAndFlush().onItem().transform(v -> d)).//! 持久化 AI 分析结果
            onFailure().invoke(t -> LOG.error("AI 分析失败, 跳过 analysisResult 回写", t)).
            onFailure().recoverWithItem(diary);
    }

    /**
     * <span style="color: f84b4b">同步情感分析与预警检测 (高优场景).</span>
     * <p>适用于需要立即返回分析结果的场景, 调用方需等待分析结果持久化完成.</p>
     *
     * @param diary 已持久化的日记实体
     * @return 更新后的日记实体 (含 analysisResult)
     */
    public @NotNull Uni<MoodDiary> analyzeAndDetect(@NotNull MoodDiary diary)
    {
        return Uni.createFrom().item(
                () ->
                {
                    final var moodResult = moodAnalysisAgent.analyze(diary.content);
                    final var warningResult = warningDetectionAgent.detect(diary.content);
                    diary.analysisResult = mergeResults(moodResult, warningResult);
                    return diary;
                }
            ).
            runSubscriptionOn(Infrastructure.getDefaultWorkerPool()).
            chain(d -> d.persistAndFlush().onItem().transform(v -> d));//! 持久化 AI 分析结果
    }

    //region 辅助方法

    private static @NotNull String mergeResults(
        @NotNull MoodAnalysisResult mood,
        @NotNull WarningDetectionResult warning
    )
    {
        final var map = new LinkedHashMap<String, Object>();
        map.put("positive", mood.positive());
        map.put("negative", mood.negative());
        map.put("anxiety", mood.anxiety());
        map.put("weather", mood.weather());
        map.put("summary", mood.summary());
        map.put("warningLevel", warning.warningLevel());
        map.put("warningReason", warning.reason());
        map.put("suggestedAction", warning.suggestedAction());
        return JsonUtils.toJson(map);
    }

    //endregion
}