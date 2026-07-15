package kurvcygnus.soulnotes.utils.enums;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link EmotionWeatherType} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class EmotionWeatherTypeTest
{
    @Test void sunny_ShouldHaveCorrectLabelAndIcon()
    {
        assertEquals("晴", EmotionWeatherType.SUNNY.getLabel());
        assertEquals("clear", EmotionWeatherType.SUNNY.getIcon());
    }

    @Test void cloudy_ShouldHaveCorrectLabelAndIcon()
    {
        assertEquals("多云", EmotionWeatherType.CLOUDY.getLabel());
        assertEquals("partly_cloudy", EmotionWeatherType.CLOUDY.getIcon());
    }

    @Test void overcast_ShouldHaveCorrectLabelAndIcon()
    {
        assertEquals("阴", EmotionWeatherType.OVERCAST.getLabel());
        assertEquals("overcast", EmotionWeatherType.OVERCAST.getIcon());
    }

    @Test void rainy_ShouldHaveCorrectLabelAndIcon()
    {
        assertEquals("雨", EmotionWeatherType.RAINY.getLabel());
        assertEquals("rain", EmotionWeatherType.RAINY.getIcon());
    }

    @Test void thunderstorm_ShouldHaveCorrectLabelAndIcon()
    {
        assertEquals("雷暴", EmotionWeatherType.THUNDERSTORM.getLabel());
        assertEquals("storm", EmotionWeatherType.THUNDERSTORM.getIcon());
    }

    @Test void allTypes_ShouldHaveNonBlankLabelAndIcon()
    {
        for(final var type : EmotionWeatherType.values())
        {
            assertNotNull(type.getLabel());
            assertFalse(type.getLabel().isBlank());
            assertNotNull(type.getIcon());
            assertFalse(type.getIcon().isBlank());
        }
    }
}