package kurvcygnus.soulnotes.utils.constants;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link AiPromptConstants} 的单元测试</b>
 *
 * @author Claude Code
 * @since 1.0
 */
class AiPromptConstantsTest
{
    @Test void classShouldBeLoadable()
    {
        assertDoesNotThrow(() -> Class.forName("kurvcygnus.soulnotes.utils.constants.AiPromptConstants"));
    }
}
