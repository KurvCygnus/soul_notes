package kurvcygnus.soulnotes.domain.chat.service;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.support.InfraProbes;
import kurvcygnus.soulnotes.support.MockLlmProfile;
import kurvcygnus.soulnotes.support.MockLlmServer;
import kurvcygnus.soulnotes.support.PipelineUsers;
import kurvcygnus.soulnotes.support.SchemaGuards;
import kurvcygnus.soulnotes.utils.PrintUtils;
import org.hibernate.reactive.mutiny.Mutiny;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * <b>无标题会话启动回填集成测试</b> (真库, 确定性回填不经 LLM).
 * <p>覆盖: 有用户消息的存量无标题会话回填为首条用户消息截断 20 字; 零用户消息 (空/仅助手) 会话保持 null;
 * 消息 JSONB 形态损坏的会话单点跳过且不阻断他人 (fail-open per session); 已有标题不被覆写;
 * 重复执行幂等 (第二轮零写入); 全程零 LLM 请求 (确定性, 标题生成器与回填各司其职).</p>
 * <p>基建守卫与 {@code ChatSessionTitleTest} 同款: 强依赖本机 postgres + redis, 缺席时类级跳过.</p>
 * @since 1.6.0
 */
@SuppressWarnings("NullableProblems")//! 测试模块不使用 JetBrains Annotations (项目测试惯例).
@QuarkusTest
@TestProfile(MockLlmProfile.class)
@EnabledIf(value = "pipelineInfraReachable", disabledReason = "本机 postgres/redis 未运行, 跳过会话标题回填真库用例")
class SessionTitleBackfillTest
{
    //* @EnabledIf 的引用方法必须落在被注解类内: QuarkusTest 类加载器下跨类全限定字符串解析失败 (ChatPipelineTest 实测先例).
    static boolean pipelineInfraReachable() { return InfraProbes.pipelineInfraReachable(); }

    private static final Duration AWAIT = Duration.ofSeconds(20);

    //* 超长首条用户消息 (30 字): 回填后必须截断至 TITLE_MAX_CHARS 封顶.
    private static final String LONG_USER_MESSAGE = "最近考试压力很大, 晚上总是翻来覆去睡不着, 白天上课也没法集中精神";

    @Inject SessionTitleBackfiller backfiller;
    @Inject Mutiny.SessionFactory sessionFactory;

    @BeforeEach
    void rearm()
    {
        SchemaGuards.ensureChatSessionTitleColumn(sessionFactory);
        //* 标题列增量之外, 实体映射还消费 pinned_at/title_source 两列 (追问链 PESSIMISTIC_WRITE 读整行):
        //* 开发库/CI 库可能未应用 08 迁移, 幂等补齐 (Task 8 顺修, SchemaGuards 契约).
        SchemaGuards.ensureChatSessionPinRenameColumns(sessionFactory);
        MockLlmProfile.server().reset();
    }

    //region ① 存量回填语义
    @Test
    void backfill_TitlelessSessions_ShouldBackfillFromFirstUserMessageAndSkipRest()
    {
        //* user_id 有外键约束: 造数用真实注册用户 (ChatSessionTitleTest 同款), 不用随机 UUID 裸插.
        final var userId = UUID.fromString(PipelineUsers.register().userId());
        //* 有用户消息的存量会话: 应回填为首条用户消息截断 20 字.
        final var withUserMessage = seed(userId, LONG_USER_MESSAGE, null);
        //* 零用户消息两类: 空历史 / 仅助手消息 — 必须保持 null (无话可命标题).
        final var emptyHistory    = seed(userId, null, "[]");
        final var assistantOnly   = seed(userId, null, "[{\"role\":\"assistant\",\"content\":\"我在听.\"}]");
        //* JSONB 形态损坏 (合法 JSON 但非消息数组): 单点跳过, 且不得阻断同批其他会话 (fail-open per session).
        final var corruptJson     = seed(userId, null, "{\"role\":\"user\",\"content\":\"这是对象不是数组\"}");
        //* 已有标题: 回填只触 title IS NULL 行, 既有标题绝不覆写.
        final var preTitled       = seed(userId, LONG_USER_MESSAGE, null, "既有标题");

        final var count = backfiller.backfillOnce().await().atMost(AWAIT);

        //* 全库计数可能含同容器早前测试类遗留的存量行, 只下界断言; 行为正确性由逐行断言承载.
        assertTrue(count >= 1, PrintUtils.quickFormat("至少回填本用例的目标会话, 实际计数: {}", count));
        assertEquals(LONG_USER_MESSAGE.substring(0, SessionTitleGenerator.TITLE_MAX_CHARS), titleOf(withUserMessage),
            PrintUtils.quickFormat("存量会话必须回填为首条用户消息截断 {} 字, 实际: {}", SessionTitleGenerator.TITLE_MAX_CHARS, titleOf(withUserMessage)));
        assertNull(titleOf(emptyHistory),  "空历史会话必须保持无标题");
        assertNull(titleOf(assistantOnly), "仅助手消息的会话必须保持无标题");
        assertNull(titleOf(corruptJson),   "消息 JSON 损坏的会话必须跳过回填 (fail-open per session)");
        assertEquals("既有标题", titleOf(preTitled), "已有标题的会话不得被回填覆写");

        //* 确定性回填零 LLM: 标题 Agent 请求锚不得出现在 mock 录制中 (标题生成是首轮交换链路的职责).
        final var titleRequests = MockLlmProfile.server().requests().stream().
            filter(r -> r.contains(MockLlmServer.TITLE_ANCHOR)).
            toList();
        assertTrue(titleRequests.isEmpty(), PrintUtils.quickFormat("回填必须零 LLM 请求, 实际录制: {}", titleRequests.size()));
    }
    //endregion

    //region ② 幂等
    @Test
    void backfill_Idempotent_SecondRunShouldBeNoOp()
    {
        final var userId = UUID.fromString(PipelineUsers.register().userId());
        final var target    = seed(userId, LONG_USER_MESSAGE, null);
        final var preTitled = seed(userId, LONG_USER_MESSAGE, null, "既有标题");

        backfiller.backfillOnce().await().atMost(AWAIT);
        final var firstTitle = titleOf(target);
        assertEquals(LONG_USER_MESSAGE.substring(0, SessionTitleGenerator.TITLE_MAX_CHARS), firstTitle, "首轮回填应产出截断标题");

        final var secondCount = backfiller.backfillOnce().await().atMost(AWAIT);

        assertEquals(0L, secondCount, PrintUtils.quickFormat("第二轮回填必须零写入 (幂等), 实际: {}", secondCount));
        assertEquals(firstTitle, titleOf(target),    "第二轮不得改动已回填标题");
        assertEquals("既有标题", titleOf(preTitled), "第二轮不得改动既有标题");
    }
    //endregion

    //region 测试脚手架
    //* 真库直插存量会话 (无标题): 不经对话链路 (AI 依赖与本题无关), ChatSessionTitleTest 造数同款取舍.
    private UUID seed(UUID userId, String firstUserContent, String rawMessages)
    {
        return seed(userId, firstUserContent, rawMessages, null);
    }

    //* rawMessages 与 firstUserContent 二选一: 前者直接落库原文 (空历史/损坏形态用), 后者按标准形态拼用户首条消息.
    private UUID seed(UUID userId, String firstUserContent, String rawMessages, String title)
    {
        final var session = new AiChatSession();
        session.id               = UUID.randomUUID();
        session.userId           = userId;
        session.messages         = rawMessages != null ?
            rawMessages :
            "[{\"role\":\"user\",\"content\":\"" + firstUserContent + "\"}]";
        session.title            = title;
        session.warningTriggered = false;
        session.updatedAt        = Instant.now().minusSeconds(3600);
        sessionFactory.withTransaction((s, tx) -> session.persist()).await().atMost(AWAIT);
        return session.id;
    }

    //* 独立事务重读会话标题: 读已提交数据, 不受一级缓存干扰 (ChatSessionTitleTest 同款).
    private String titleOf(UUID sessionId)
    {
        return sessionFactory.withTransaction((session, tx) ->
            session.find(AiChatSession.class, sessionId)
        ).await().atMost(AWAIT).title;
    }
    //endregion
}
