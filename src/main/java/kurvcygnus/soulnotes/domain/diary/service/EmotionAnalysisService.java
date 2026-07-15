package kurvcygnus.soulnotes.domain.diary.service;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.diary.entity.MoodDiary;
import org.jetbrains.annotations.NotNull;

/**
 * <b>情感分析服务</b>
 * <ul>
 *     <li>封装 AI {@code MoodAnalysisAgent} 与 {@code WarningDetectionAgent} 的调用编排</li>
 *     <li>分析结果回写 {@link MoodDiary#analysisResult} JSONB 字段</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class EmotionAnalysisService
{
    /**
     * <span style="color: 95cc6d">异步情感分析 (不阻塞主流程, 用户无需等待).</span>
     * <p>适用于创建日记等场景 — 先保存 Diary, 后台线程执行 AI 分析, 完成后再回写结果.</p>
     *
     * @param diary 已持久化的日记实体
     * @return 更新后的日记实体
     */
    public @NotNull Uni<MoodDiary> analyzeAsync(@NotNull MoodDiary diary)
    {
        //? TODO Phase 2: 使用 Executor / @Asynchronous 将 AI 调用放入 worker 线程池.
        //?               调用 MoodAnalysisAgent.analyze(diary.content) → 得到 MoodAnalysisResult
        //?               调用 WarningDetectionAgent.detect(diary.content) → 得到 WarningDetectionResult
        //?               将结果 JSON 序列化后写入 diary.analysisResult
        //?               若 WarningLevel == RED, 调用 AlertWebSocket.pushAlert() 进行推送.
        return Uni.createFrom().item(diary);
    }

    /**
     * <span style="color: f84b4b">同步情感分析与预警检测 (高优场景).</span>
     * <p>适用于需要立即返回分析结果的场景, 调用方需等待完成.</p>
     *
     * @param diary 已持久化的日记实体
     * @return 更新后的日记实体 (含 analysisResult)
     */
    public @NotNull Uni<MoodDiary> analyzeAndDetect(@NotNull MoodDiary diary)
    {
        //? TODO Phase 2: 同步调用 MoodAnalysisAgent + WarningDetectionAgent
        //?               结果直接写入 diary.analysisResult 并持久化
        //?               RED 预警时推送 AlertWebSocket
        return Uni.createFrom().item(diary);
    }
}