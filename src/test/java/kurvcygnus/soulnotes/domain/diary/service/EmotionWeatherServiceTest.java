package kurvcygnus.soulnotes.domain.diary.service;

import kurvcygnus.soulnotes.utils.enums.EmotionWeatherType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link EmotionWeatherService} 的单元测试</b>
 * <p>通过反射测试私有工具方法 {@code mapWeather} 的天气映射逻辑.</p>
 *
 * @author Claude Code
 * @since 1.0
 */
class EmotionWeatherServiceTest
{
    private static EmotionWeatherType invokeMapWeather(double positive, double negative, double anxiety) throws Exception
    {
        final var method = EmotionWeatherService.class.getDeclaredMethod("mapWeather", double.class, double.class, double.class);
        method.setAccessible(true);
        return (EmotionWeatherType) method.invoke(null, positive, negative, anxiety);
    }

    @Test void highAnxiety_ShouldReturnThunderstorm() throws Exception
    {
        assertEquals(EmotionWeatherType.THUNDERSTORM, invokeMapWeather(0.1, 0.5, 0.85));
    }

    @Test void highNegative_ShouldReturnThunderstorm() throws Exception
    {
        assertEquals(EmotionWeatherType.THUNDERSTORM, invokeMapWeather(0.1, 0.85, 0.5));
    }

    @Test void moderateNegative_ShouldReturnRainy() throws Exception
    {
        assertEquals(EmotionWeatherType.RAINY, invokeMapWeather(0.3, 0.65, 0.3));
    }

    @Test void highPositive_ShouldReturnSunny() throws Exception
    {
        assertEquals(EmotionWeatherType.SUNNY, invokeMapWeather(0.7, 0.2, 0.1));
    }

    @Test void lowPositiveModerateNegative_ShouldReturnOvercast() throws Exception
    {
        assertEquals(EmotionWeatherType.OVERCAST, invokeMapWeather(0.3, 0.45, 0.3));
    }

    @Test void allModerate_ShouldReturnCloudy() throws Exception
    {
        assertEquals(EmotionWeatherType.CLOUDY, invokeMapWeather(0.3, 0.3, 0.3));
    }

    @Test void boundaryThunderstorm_AnxietyAbove08() throws Exception
    {
        //* 边界值: anxiety > 0.8 使用严格大于, 因此 0.81 触发 THUNDERSTORM.
        assertEquals(EmotionWeatherType.THUNDERSTORM, invokeMapWeather(0.5, 0.3, 0.81));
    }

    @Test void boundaryRainy_NegativeAbove06() throws Exception
    {
        //* 边界值: negative > 0.6 使用严格大于, 因此 0.61 触发 RAINY.
        assertEquals(EmotionWeatherType.RAINY, invokeMapWeather(0.3, 0.61, 0.3));
    }

    @Test void boundarySunny_PositiveAbove06() throws Exception
    {
        //* 边界值: positive > 0.6 使用严格大于, 因此 0.61 触发 SUNNY.
        assertEquals(EmotionWeatherType.SUNNY, invokeMapWeather(0.61, 0.3, 0.3));
    }

    @Test void boundaryOvercast_NegativeAbove04() throws Exception
    {
        //* 边界值: negative > 0.4 使用严格大于, 因此 0.41 触发 OVERCAST.
        assertEquals(EmotionWeatherType.OVERCAST, invokeMapWeather(0.3, 0.41, 0.3));
    }

    @Test void allExtremes_ThunderstormTakesPriority() throws Exception
    {
        //* 当 anxiety 和 positive 同时很高时, 高 anxiety 应优先映射为 THUNDERSTORM.
        assertEquals(EmotionWeatherType.THUNDERSTORM, invokeMapWeather(0.9, 0.1, 0.85));
    }

    //region 精确边界值测试 (当前实现使用严格 >)
    //* 下面是 mapWeather 当前使用严格 > 的边界值测试.
    //? 如果后续改为 >=, 这些测试需要同步更新.

    @Test void boundaryExact_AnxietyEq08_ShouldNotBeThunderstorm() throws Exception
    {
        //* anxiety=0.8 不满足 >0.8, 继续向下匹配 → 最终落至 CLOUDY.
        assertEquals(EmotionWeatherType.CLOUDY, invokeMapWeather(0.5, 0.3, 0.8));
    }

    @Test void boundaryExact_NegativeEq08_ShouldNotBeThunderstorm() throws Exception
    {
        //* negative=0.8 不满足 >0.8, 但满足 >0.6 → RAINY.
        assertEquals(EmotionWeatherType.RAINY, invokeMapWeather(0.7, 0.8, 0.3));
    }

    @Test void boundaryExact_NegativeEq06_ShouldNotBeRainy() throws Exception
    {
        assertEquals(EmotionWeatherType.OVERCAST, invokeMapWeather(0.3, 0.6, 0.3));
    }

    @Test void boundaryExact_PositiveEq06_ShouldNotBeSunny() throws Exception
    {
        assertEquals(EmotionWeatherType.CLOUDY, invokeMapWeather(0.6, 0.4, 0.3));
    }

    @Test void boundaryExact_NegativeEq04_ShouldNotBeOvercast() throws Exception
    {
        assertEquals(EmotionWeatherType.CLOUDY, invokeMapWeather(0.3, 0.4, 0.3));
    }
    //endregion
}