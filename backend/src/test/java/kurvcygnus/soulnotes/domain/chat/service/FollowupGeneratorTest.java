package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import kurvcygnus.soulnotes.utils.JsonUtils;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>{@link FollowupGenerator#parseFollowups} 解析容错纯函数测试</b>.
 * <p>钉死 LLM 回复 -> 追问列表的归一化契约: 提取 JSON 数组 + 恰好 3 条硬约束 + 任何不合规整组拒绝
 * (fail-open, SSE 契约"恰好 0-3 条"的 0 由此而来).</p>
 * @since 1.8.0
 */
class FollowupGeneratorTest
{
    @BeforeAll
    @SuppressWarnings("InstantiationOfUtilityClass")//! JsonUtils 为 final 全静态成员类, IDE 误报实例化; 构造器正是 CDI 桥接注入入口.
    static void initMapper()
    {
        //* 纯单元测试无 CDI 容器, 手动构造与生产等价的 mapper (AiChatSessionTest 同款).
        new JsonUtils(new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    //region 合规产物
    @Test
    void parseFollowups_ValidArrayOfThree_ShouldReturnItemsInOrder()
    {
        assertEquals(3, FollowupGenerator.FOLLOWUP_COUNT, "追问条数硬契约必须为 3 (SSE 契约对账基准)");
        assertEquals(List.of("追问甲", "追问乙", "追问丙"),
            FollowupGenerator.parseFollowups("[\"追问甲\",\"追问乙\",\"追问丙\"]"), "严格 JSON 数组应原样透传");
    }

    @Test
    void parseFollowups_ProseWrappedArray_ShouldExtractArray()
    {
        assertEquals(List.of("第一条", "第二条", "第三条"),
            FollowupGenerator.parseFollowups("好的, 以下是追问: [\"第一条\",\"第二条\",\"第三条\"] 希望有帮助"),
            "数组前后夹带说明文字时应提取 JSON 数组");
    }

    @Test
    void parseFollowups_CodeFenceWrapped_ShouldExtractArray()
    {
        assertEquals(List.of("第一条", "第二条", "第三条"),
            FollowupGenerator.parseFollowups("```json\n[\"第一条\",\"第二条\",\"第三条\"]\n```"),
            "代码块围栏包裹时应提取 JSON 数组");
    }

    @Test
    void parseFollowups_ItemsWithWhitespace_ShouldStripEachItem()
    {
        assertEquals(List.of("第一条", "第二条", "第三条"),
            FollowupGenerator.parseFollowups("[\" 第一条 \",\" 第二条\",\"第三条 \"]"), "条目首尾空白应剥离");
    }
    //endregion

    //region 不合规产物整组拒绝
    @Test
    void parseFollowups_CountNotThree_ShouldRejectAll()
    {
        assertEquals(List.of(), FollowupGenerator.parseFollowups("[\"只有\",\"两条\"]"), "2 条不合规, 整组拒绝");
        assertEquals(List.of(), FollowupGenerator.parseFollowups("[\"一\",\"二\",\"三\",\"四\"]"), "4 条不合规, 整组拒绝");
        assertEquals(List.of(), FollowupGenerator.parseFollowups("[]"), "空数组不合规, 整组拒绝");
    }

    @Test
    void parseFollowups_BlankItem_ShouldRejectAll()
    {
        assertEquals(List.of(), FollowupGenerator.parseFollowups("[\"第一条\",\"   \",\"第三条\"]"),
            "空白条目剥离后不足 3 条有效追问, 整组拒绝");
    }

    @Test
    void parseFollowups_MalformedJson_ShouldRejectAll()
    {
        assertEquals(List.of(), FollowupGenerator.parseFollowups("[追问甲, 追问乙, 追问丙]"), "非字符串元素非法 JSON, 整组拒绝");
        assertEquals(List.of(), FollowupGenerator.parseFollowups("[\"第一条\", \"第二条\""), "截断 JSON 整组拒绝");
    }

    @Test
    void parseFollowups_NotAnArray_ShouldRejectAll()
    {
        assertEquals(List.of(), FollowupGenerator.parseFollowups("追问甲, 追问乙, 追问丙"), "无数组形态的纯文本整组拒绝");
        //* 对象包裹数组属可恢复偏离: 夹取启发式提取内层 3 条数组 (规范"提取 JSON 数组"的容错面), 不整组拒绝.
        assertEquals(List.of("a", "b", "c"), FollowupGenerator.parseFollowups("{\"items\":[\"a\",\"b\",\"c\"]}"),
            "对象包裹的合法 3 条数组应提取内层数组");
    }

    @Test
    void parseFollowups_NullOrBlankReply_ShouldRejectAll()
    {
        //* null 回复按失败同语义拒绝 (转空列表): 模型偶发空 content 成功返回, 归一化若 NPE
        //! 会夭折整条生成链 — 与 SessionTitleGenerator#normalizedTitle 的 null 防御同款教训.
        assertEquals(List.of(), FollowupGenerator.parseFollowups(null), "null 回复必须拒绝, 不得 NPE");
        assertEquals(List.of(), FollowupGenerator.parseFollowups("   "), "纯空白回复必须拒绝");
        assertEquals(List.of(), FollowupGenerator.parseFollowups(""), "空串回复必须拒绝");
    }
    //endregion
}
