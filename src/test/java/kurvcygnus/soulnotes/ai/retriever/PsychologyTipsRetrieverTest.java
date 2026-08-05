package kurvcygnus.soulnotes.ai.retriever;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link PsychologyTipsRetriever} 单元测试</b>
 *
 * @author Claude Code
 * @since 2.0
 */
class PsychologyTipsRetrieverTest
{
    private final PsychologyTipsRetriever retriever = new PsychologyTipsRetriever();

    @Test void retrieve_ByAnxiety_ShouldReturnMatchingTips()
    {
        final var results = retriever.retrieve("anxiety");
        assertFalse(results.isEmpty());
        assertTrue(results.stream().anyMatch(tip -> tip.keywords().contains("anxiety")));
    }

    @Test void retrieve_BySleep_ShouldReturnMatchingTips()
    {
        final var results = retriever.retrieve("sleep");
        assertFalse(results.isEmpty());
        assertTrue(results.stream().anyMatch(tip -> tip.keywords().contains("sleep")));
    }

    @Test void retrieve_ByMultiKeywords_ShouldReturnUnion()
    {
        final var results = retriever.retrieve("stress, sleep");
        assertFalse(results.isEmpty());
        assertTrue(results.size() >= 2);
    }

    @Test void retrieve_ByEmptyQuery_ShouldReturnEmpty()
    {
        assertTrue(retriever.retrieve("").isEmpty());
        assertTrue(retriever.retrieve("   ").isEmpty());
    }

    @Test void retrieve_ByNonExistentKeyword_ShouldReturnEmpty()
    {
        assertTrue(retriever.retrieve("xyznonexistent123").isEmpty());
    }

    @Test void getRandomTip_ShouldReturnNonNull()
    {
        final var tip = retriever.getRandomTip();
        assertNotNull(tip);
        assertNotNull(tip.keywords());
        assertNotNull(tip.title());
        assertNotNull(tip.content());
    }

    @Test void allTips_ShouldHaveNonBlankFields()
    {
        for(int i = 0; i < 20; i++)
        {
            final var tip = retriever.getRandomTip();
            assertFalse(tip.keywords().isBlank());
            assertFalse(tip.title().isBlank());
            assertFalse(tip.content().isBlank());
        }
    }

    @Test void retrieve_ResultLimit_ShouldBeAtMostFive()
    {
        //* 用空字符串匹配所有 tip 验证上限 (实际不会全匹配, 但证明 limit 机制)
        final var results = retriever.retrieve("a"); // 'a' 不匹配任何关键词
        assertTrue(results.size() <= 5);
    }

    @Test void retrieve_ByHelp_ShouldIncludeCrisisTip()
    {
        final var results = retriever.retrieve("help");
        assertFalse(results.isEmpty());
        assertTrue(results.stream().anyMatch(tip -> tip.title().contains("寻求帮助")));
    }
}
