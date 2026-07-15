package kurvcygnus.soulnotes.domain.diary.service;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.diary.dto.EmotionWeatherVo;
import kurvcygnus.soulnotes.domain.diary.entity.MoodDiary;
import kurvcygnus.soulnotes.utils.TimeUtils;
import kurvcygnus.soulnotes.utils.enums.EmotionWeatherType;
import org.jetbrains.annotations.NotNull;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * <b>情绪天气预报服务</b>
 * <p>按时间维度聚合情感分析数据, 生成前端"情绪天气预报"可视化所需的数据.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class EmotionWeatherService
{
    //* 统一使用 TimeUtils 中定义的上海时区, 避免多处硬编码.

    /**
     * <span style="color: 95cc6d">按日聚合用户指定日期范围内的情感数据.</span>
     *
     * @param userId 用户 ID
     * @param start  开始日期 (含)
     * @param end    结束日期 (含)
     * @return 按天排列的情绪天气预报 VO 列表
     */
    public @NotNull Uni<List<EmotionWeatherVo>> getWeatherData(
        @NotNull UUID userId,
        @NotNull LocalDate start,
        @NotNull LocalDate end
    )
    {
        final var startInstant = start.atStartOfDay(TimeUtils.ZONE_ASIA_SHANGHAI).toInstant();
        final var endInstant   = end.plusDays(1).atStartOfDay(TimeUtils.ZONE_ASIA_SHANGHAI).toInstant();

        return MoodDiary.findByUserAndDateRange(userId, startInstant, endInstant).
            list().
            map(this::aggregateByDay);
    }
    
    //region 聚合逻辑
    //* 将日记列表按日分组, 计算每日的情感均值并映射为天气类型.
    private @NotNull List<EmotionWeatherVo> aggregateByDay(@NotNull List<MoodDiary> diaries)
    {
        //? TODO Phase 2: 实现按日分组 + 情感均值的聚合逻辑.
        //?               对于每一日:
        //?                 1. 解析日记的 analysisResult (JSON), 提取 positive/negative/anxiety
        //?                 2. 计算当日各指标均值
        //?                 3. 根据均值映射 EmotionWeatherType
        //?                 4. 构造 EmotionWeatherVo
        //?               当前返回空列表占位.
        return List.of();
    }

    //! 此处为简化天气映射逻辑, Phase 2 应根据实际情感分数做更细致的映射.
    @SuppressWarnings("unused")
    private static @NotNull EmotionWeatherType mapWeather(double positive, double negative, double anxiety)
    {
        if(anxiety > 0.8 || negative > 0.8)
            return EmotionWeatherType.THUNDERSTORM;
        if(negative > 0.6)
            return EmotionWeatherType.RAINY;
        if(positive > 0.6)
            return EmotionWeatherType.SUNNY;
        if(negative > 0.4)
            return EmotionWeatherType.OVERCAST;
        return EmotionWeatherType.CLOUDY;
    }
    //endregion
}