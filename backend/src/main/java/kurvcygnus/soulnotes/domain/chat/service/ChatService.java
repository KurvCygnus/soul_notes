package kurvcygnus.soulnotes.domain.chat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.hibernate.reactive.panache.Panache;
import io.quarkus.hibernate.reactive.panache.common.WithTransaction;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.infrastructure.Infrastructure;
import io.smallrye.mutiny.subscription.MultiEmitter;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.ai.ClinicalOutputSplitter;
import kurvcygnus.soulnotes.ai.agent.EmpatheticChatAgent;
import kurvcygnus.soulnotes.ai.agent.WarningDetectionAgent;
import kurvcygnus.soulnotes.ai.dto.WarningDetectionResult;
import kurvcygnus.soulnotes.config.ClinicalSchemaNormalizer;
import kurvcygnus.soulnotes.config.PromptProvider;
import kurvcygnus.soulnotes.domain.chat.dto.ChatHistoryMessage;
import kurvcygnus.soulnotes.domain.chat.dto.ChatMessageVo;
import kurvcygnus.soulnotes.domain.chat.dto.ChatSendRequest;
import kurvcygnus.soulnotes.domain.chat.dto.ChatSessionVo;
import kurvcygnus.soulnotes.domain.chat.dto.SessionPinVo;
import kurvcygnus.soulnotes.domain.chat.entity.AiChatSession;
import kurvcygnus.soulnotes.domain.chat.entity.UserChatStyle;
import kurvcygnus.soulnotes.domain.clinical.service.ClinicalAssessmentService;
import kurvcygnus.soulnotes.domain.extension.ExtensionRegistry;
import kurvcygnus.soulnotes.domain.extension.IDataExtension;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.exception.IBusinessException;
import kurvcygnus.soulnotes.utils.JsonUtils;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.constants.AiPromptConstants;
import kurvcygnus.soulnotes.websocket.AlertDispatchService;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * AI 对话服务, 承载树洞对话的完整链路: 消息收发 (同步 + SSE 流式)、会话历史管理、
 * 预警检测与 RED 预警分发 (统一收口至 AlertDispatchService: 冷却闸门 + 多渠道推送),
 * 以及结构化输出管线 ("副医生"预埋: 契约提示词组装 + soulnotes 块拆流
 * + 评估落库 best-effort 挂点).
 *
 * @implNote LLM 与预警检测均为阻塞调用, 一律经 {@code vertx.executeBlocking} 在 worker 线程池执行,
 *           结果回到事件循环后再操作 Hibernate reactive Session (规避 HR000068/069).
 *           LLM 失败不向外抛错: send 与 stream 两条路径对称地补发固定兜底文案并正常收尾 (离线安全网).
 * @since 1.0
 */
@SuppressWarnings("JavadocDeclaration") @ApplicationScoped
public final class ChatService
{
    private static final Logger LOG = LoggerFactory.getLogger(ChatService.class);

    //* LLM 失败时的兜底文案: send 与 stream 两条路径必须使用同一份, 保证降级语义对称.
    private static final @NotNull String FALLBACK_REPLY = "我似乎有些走神了，你能再说一遍吗？";

    //* 重命名标题硬上限 (字): 与前端 RenameDialog 的 100 字口径对齐, 校验在服务端同样成立 (前端校验可绕过).
    static final int SESSION_TITLE_MAX_CHARS = 100;

    //* 扩展情境贡献的单扩展收集超时: SPI 实现方可能外呼第三方, 300ms 内未产出即按 "无贡献" 降级 —
    //* 情境参考是锦上添花内容, 绝不允许拖慢对话主链路 (与 AI 降级链路同一 fail-fast 精神).
    private static final Duration EXT_CONTRIBUTION_TIMEOUT = Duration.ofMillis(300);

    //* 扩展情境块合并总长上限 (字): ~500 token 的中文保守上界 (1 字 ≈ 0.5~1 token, 取上限留余量) —
    //* 多扩展贡献合并后一次性截断, 防情境块挤占对话历史的 token 预算.
    static final int EXT_CONTEXT_MAX_CHARS = 1000;

    //region 注入
    private final @NotNull EmpatheticChatAgent empatheticChatAgent;
    private final @NotNull WarningDetectionAgent warningDetectionAgent;
    private final @NotNull PromptProvider promptProvider;
    //* 临床结构归一化缓存: 自定义结构只有归一化产物才允许进入对话契约.
    private final @NotNull ClinicalSchemaNormalizer schemaNormalizer;
    //* 临床评估落库: 拆流挂点的 best-effort 消费方 — 失败仅 WARN, 对话可用性 > 评估完整性 (Spec §7).
    private final @NotNull ClinicalAssessmentService clinicalAssessmentService;
    //* RED 预警统一分发收口: per-user 冷却闸门 + 渠道 fan-out + "渠道全空"WARN 哨兵均内含于分发器,
    //* 本服务只负责触发 — 冷却只闸门外呼, 落库标记 warningTriggered 仍在本服务.
    private final @NotNull AlertDispatchService alertDispatchService;
    //* 会话标题生成器: 首轮交换完成后的 fire-and-forget 挂点 (fail-open, 内部自持线程纪律).
    private final @NotNull SessionTitleGenerator sessionTitleGenerator;
    //* 候选追问生成器: 每轮回复落库后的并行挂点 (fail-open, 内部自持线程纪律); 流路径另经其 Uni 补发尾随事件.
    private final @NotNull FollowupGenerator followupGenerator;
    //* 数据扩展注册表: 每条用户消息并行收集各扩展的情境贡献 (P3 注入挂点, 见 collectExtensionContext).
    private final @NotNull ExtensionRegistry extensionRegistry;
    private final @NotNull Vertx vertx;
    //* 会话历史最多保留的消息条数, 防止 JSONB 无限增长与 Token 超限.
    private final int maxHistoryMessages;
    //* 结构化输出契约开关 ("副医生"预埋): on 时共情提示词追加契约段, 回复落库前拆流.
    private final boolean clinicalTagging;
    //* 结构增强暂禁告警只发一次: 未命中缓存的每条消息都 WARN 会把启动期降级放大成告警噪音.
    private final @NotNull AtomicBoolean schemaSuspendedWarned = new AtomicBoolean();

    public ChatService(
        @NotNull EmpatheticChatAgent empatheticChatAgent,
        @NotNull WarningDetectionAgent warningDetectionAgent,
        @NotNull PromptProvider promptProvider,
        @NotNull ClinicalSchemaNormalizer schemaNormalizer,
        @NotNull ClinicalAssessmentService clinicalAssessmentService,
        @NotNull AlertDispatchService alertDispatchService,
        @NotNull SessionTitleGenerator sessionTitleGenerator,
        @NotNull FollowupGenerator followupGenerator,
        @NotNull ExtensionRegistry extensionRegistry,
        @NotNull Vertx vertx,
        @ConfigProperty(name = "chat.history.max-messages", defaultValue = "50") int maxHistoryMessages,
        @ConfigProperty(name = "clinical.tagging", defaultValue = "false") boolean clinicalTagging
    )
    {
        this.empatheticChatAgent = empatheticChatAgent;
        this.warningDetectionAgent = warningDetectionAgent;
        this.promptProvider = promptProvider;
        this.schemaNormalizer = schemaNormalizer;
        this.clinicalAssessmentService = clinicalAssessmentService;
        this.alertDispatchService = alertDispatchService;
        this.sessionTitleGenerator = sessionTitleGenerator;
        this.followupGenerator = followupGenerator;
        this.extensionRegistry = extensionRegistry;
        this.vertx = vertx;
        this.maxHistoryMessages = maxHistoryMessages;
        this.clinicalTagging = clinicalTagging;
    }
    //endregion

    //region 核心业务
    /**
     * 发送用户消息并返回 AI 回复: 主链路收拢为单个 programmatic 事务 (Session 加载/创建经
     * {@code getOrCreateSession} 的自带事务并入, 与旧 {@code @WithTransaction} 语义等价),
     * 评估落库在主事务提交后的事件循环链尾 fire (best-effort, 失败仅 WARN).
     * <p>流程: 加载/创建 Session → 追加并截断用户消息 → worker 线程执行 LLM 调用 →
     * 预警检测 → 持久化 AI 回复 → 事务提交后 fire 评估落库.</p>
     *
     * <p>LLM 调用失败时不抛出错误: 返回固定兜底文案 (同样落库),
     * 保证前端永远收到可展示的回复 — 离线安全网语义的一部分.</p>
     *
     * @param req    发送请求 (含可选会话 ID 与消息内容)
     * @param userId 当前认证用户 ID
     * @return 助手角色的回复消息; LLM 不可用时为兜底文案
     * @throws IBusinessException 会话 ID 不存在时 (SESSION_NOT_FOUND)
     */
    public @NotNull Uni<ChatMessageVo> sendMessage(@NotNull ChatSendRequest req, @NotNull UUID userId)
    {
        //* 挂点在事务外链尾 fire, 而 Session 实体出事务即脱离持久化上下文 (分离实体再 persist 会退化为
        //* 同 id 重 INSERT, 集成测试实证 duplicate key 23505) — 加载与持久化必须同事务, 实体经原子引用
        //* 带出事务供挂点取 id/userId (单链顺序写读, 无并发竞争).
        final var sessionRef = new AtomicReference<AiChatSession>();
        //* 首轮交换判定必须在追加用户消息前采样 (messages 为空即首轮): 标题只从首轮交换生成.
        final var firstExchangeRef = new AtomicBoolean();
        return Panache.withTransaction(
            () ->
            getOrCreateSession(req.sessionId(), userId).
                flatMap(
                    session ->
                    {
                        sessionRef.set(session);
                        firstExchangeRef.set(countMessages(session.messages) == 0);
                        session.addMessage("user", req.content());
                        session.truncate(maxHistoryMessages);
                        //* 风格指令块在同事务内读取 (无行/全 default 为空串): 风格只作用于本轮共情请求的措辞;
                        //* 扩展情境贡献在风格之后并行收集 (各扩展并行 + 单扩展超时降级, 均不触碰 DB).
                        return loadStyleDirectives(userId).
                            flatMap(directives ->
                                collectExtensionContext(userId).
                                    flatMap(extContext -> callAiAndRespond(session, req.content(), directives, extContext)));
                    }
                )
            ).
            invoke(outcome ->
                {
                    final var session = Objects.requireNonNull(
                        sessionRef.get(),
                        "Param \"session\" must not be null!"
                    );
                    fireClinicalRecord(session, outcome.clinicalPayload());
                    fireSessionTitle(session, firstExchangeRef.get(), req.content(), outcome.visible());
                    fireFollowups(session, req.content(), outcome.visible());
                }
            ).
            map(outcome ->
                {
                    final var session = Objects.requireNonNull(
                        sessionRef.get(),
                        "Param \"session\" must not be null!"
                    );
                    //* followups 恒空数组: 追问在本响应返回后才异步生成, 前端经历史回放/流路径尾随事件获取.
                    return new ChatMessageVo("assistant", outcome.visible(), Instant.now(), session.id.toString(), List.of());
                }
            );
    }

    /**
     * SSE 流式回复: 流首恒发一条 meta 事件回传实际使用的 sessionId (新建会话同样回传),
     * 之后先独立事务持久化用户消息, 再逐 token 推送 AI 回复,
     * 流式完成后以独立事务持久化完整回复并执行预警检测.
     *
     * @param sessionId 会话 ID; {@code null}/空白/非法 UUID 一律回退为新会话 (不报错)
     * @param content   用户消息
     * @param userId    当前认证用户 ID
     * @return 流首为 meta 事件 ({@code {"type":"meta","sessionId":"<uuid>"}}), 之后为 AI 回复的流式块;
     *         LLM 发起工具调用时插入 tool-call 过程事件
     *         ({@code {"type":"tool-call","name":"...","label":"..."}}, label 为扩展自定义文案, @since 2.2.1);
     *         流尾以 followups 尾随事件收口 ({@code {"type":"followups","items":[...]}}, 恰好 0-3 条,
     *         追问生成失败 = 无此事件, 聊天流不受影响);
     *         LLM 中途失败时补发兜底文案后正常收流 (不向下游发失败信号),
     *         会话不存在时以失败 Uni 发出 SESSION_NOT_FOUND (meta 亦不发出)
     * @implNote Multi 返回类型无法使用 {@code @WithTransaction} (长事务会长时间占用 Hibernate session),
     *           因此每个持久化操作都通过 {@code Panache.withTransaction} 独立事务完成.
     *           emit 给前端的 token 保持原文, 结构化契约块只在落库文本上剥离 —
     *           若缓冲到流结束再拆流须扣留全部 token, 既破坏逐字渲染, 流中断时还会整段丢失已扣留内容.
     * @since 1.5.0 (流首 meta 会话绑定事件契约)
     */
    @SuppressWarnings("unused")//! transformToMulti 返回的 Multi 即最终流, IDE 的 Mutiny 数据流分析误报为未使用发布者.
    public @NotNull Multi<String> streamMessage(
        @Nullable String sessionId,
        @NotNull String content,
        @NotNull UUID userId
    )
    {
        //! 该链路的返回值即最终流; IDE 数据流分析对 transformToMulti 误报"值从未被用作发布者".
        final var sid = parseSessionId(sessionId);
        //* 首轮交换判定必须在追加用户消息前采样 (getOrCreateSession 产物为加载时快照): 标题只从首轮交换生成.
        final var firstExchangeRef = new AtomicBoolean();
        return getOrCreateSession(sid, userId).
            chain(
                session ->
                {
                    firstExchangeRef.set(countMessages(session.messages) == 0);
                    return appendUserMessage(session.id, userId, content);
                }
            ).
            onItem().transformToMulti(
                prep ->
                //* 流首恒发 meta 事件 (回传实际使用的 sessionId), 之后才是 token 流 —
                //* 串联而非先发 token 再补 meta: 前端在首个 token 前就必须能绑定会话.
                Multi.createBy().concatenating().streams(
                    Multi.createFrom().item(metaEvent(prep.session().id)),
                    streamAiReply(prep.session(), content, firstExchangeRef.get(), prep.styleDirectives(), prep.extContext())
                )
            );
    }

    /**
     * 查询当前用户的会话概览列表 (按最近活跃排序).
     *
     * @param userId 当前认证用户 ID
     * @return 会话概览列表 (可能为空, 恒非 null); 预览超 50 字截断, 消息 JSON 损坏时该条计为 0 条/空预览;
     *         置顶时刻随行透传 (null = 未置顶), 前端据此分组 "置顶" 节
     */
    @WithTransaction
    public @NotNull Uni<List<ChatSessionVo>> listSessions(@NotNull UUID userId)
    {
        return AiChatSession.findByUserId(userId).
            map(sessions -> sessions.stream().
                map(
                    s -> new ChatSessionVo(
                        s.id,
                        countMessages(s.messages),
                        s.updatedAt,
                        s.title,
                        getPreview(s.messages),
                        s.pinnedAt
                    )
                ).toList()
            );
    }

    /**
     * 拉取指定会话的完整消息历史 (按对话顺序, 含 LLM 回复).
     *
     * @param sessionId 会话 ID
     * @param userId    当前认证用户 ID (归属校验依据)
     * @return 消息列表 (role/content/ts 按对话顺序; 空会话为空列表, 恒非 null; ts 为 ISO-8601 字符串, 存量消息为 null)
     * @throws IBusinessException 会话不存在或不属于当前用户时 (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @implNote 消息 JSONB 存 role/content/ts 三键, 存量两键行的 ts 读取为 null; 损坏 JSON 按空列表降级 (与预览/计数同款容错).
     * @since 1.5.0 (历史条目透传 ts 时间戳, 前端据此做时间分组; null 不分组)
     */
    @WithTransaction
    public @NotNull Uni<List<ChatHistoryMessage>> listMessages(@NotNull UUID sessionId, @NotNull UUID userId)
        { return loadOwnedSession(sessionId, userId).map(session -> parseHistory(session.messages)); }

    /**
     * 删除指定会话 (硬删除, 含全部消息历史).
     *
     * @param sessionId 会话 ID
     * @param userId    当前认证用户 ID (归属校验依据)
     * @return 完成信号
     * @throws IBusinessException 会话不存在或不属于当前用户时 (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @implNote 硬删除与日记域先例一致; 关联的 RED 预警已推送记录不受影响 (预警渠道为 fire-and-forget 外呼, 无会话外键).
     * @since 1.2.1
     */
    @WithTransaction
    public @NotNull Uni<Void> deleteSession(@NotNull UUID sessionId, @NotNull UUID userId) { return loadOwnedSession(sessionId, userId).chain(AiChatSession::delete); }

    /**
     * 置顶翻转指定会话 (服务端按当前态取反).
     *
     * @param sessionId 会话 ID
     * @param userId    当前认证用户 ID (归属校验依据)
     * @return 翻转后的置顶时刻 VO ({@code pinnedAt} 为 null 即已取消); 前端一律以响应落定, 不自行推断
     * @throws IBusinessException 会话 ID 非法、不存在或不属于当前用户时 (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @implNote 翻转读取当前态后取反: 前端无需持有旧状态, 并发双击也收敛到服务端事实序.
     *           置顶不触碰 updatedAt — 置顶是组织行为而非对话活动, 侧栏 "最近活跃" 排序不受扰动
     *           (标题落库同款先例); 整行更新经实体映射驱动, pinned_at 列随行写回无丢失.
     *           <b>并发取舍 (Task 8 裁定, 注释改准)</b>: 本方法读改写未加 PESSIMISTIC_WRITE 锁 —
     *           与标题/追问链的锁定读不同, 本处的取反语义下并发双写只是 "后写覆盖前写" 的丢失更新,
     *           最终态仍与服务端最后一次请求一致, 且单用户置顶操作频率极低 — 加锁的串行化收益
     *           抵不过多一次锁往返, 故记录取舍不加锁.
     * @since 1.9.0
     */
    @WithTransaction
    public @NotNull Uni<SessionPinVo> togglePin(@NotNull UUID sessionId, @NotNull UUID userId)
    {
        return loadOwnedSession(sessionId, userId).
            flatMap(
                session ->
                {
                    session.pinnedAt = session.pinnedAt == null ? Instant.now() : null;
                    return session.persist().replaceWith(new SessionPinVo(session.pinnedAt));
                }
            );
    }

    /**
     * 重命名指定会话: 剥离首尾空白后校验 (非空且不超 {@link #SESSION_TITLE_MAX_CHARS} 字),
     * 落库并标记 {@code title_source='manual'}.
     *
     * @param sessionId 会话 ID
     * @param title     新标题 (原始输入)
     * @param userId    当前认证用户 ID (归属校验依据)
     * @return 完成信号
     * @throws IBusinessException 标题 null/空白/超长时 (BAD_REQUEST); 会话 ID 非法、不存在或不属于当前用户时
     *                            (SESSION_NOT_FOUND, 同码同文案防枚举)
     * @implNote manual 标记是标题链豁免的事实源: SessionTitleGenerator/SessionTitleBackfiller 以
     *           {@code title_source='manual'} 作独立写闸门 — 手动标题在数据层被永久保护,
     *           不依赖 "标题已非空" 的既有幂等守卫. 校验先于会话寻址: 非法输入不泄露会话存在性.
     * @since 1.9.0
     */
    @WithTransaction
    public @NotNull Uni<Void> renameSession(@NotNull UUID sessionId, @NotNull String title, @NotNull UUID userId)
    {
        //* null 检查先于 strip: JSON {"title":null} 直达服务层时 strip 会 NPE 落 500 — 与空白标题同码 400 (Task 8 顺修).
        if(title == null || title.strip().isEmpty())
            throw IBusinessException.of(
                ErrorCode.BAD_REQUEST,
                "标题不能为空",
                IllegalArgumentException::new,
                "CHAT_RENAME_BLANK_TITLE"
            ).asException();
        final var normalized = title.strip();
        if(normalized.length() > SESSION_TITLE_MAX_CHARS)
            throw IBusinessException.of(
                ErrorCode.BAD_REQUEST,
                PrintUtils.quickFormat("标题不能超过 {} 字", SESSION_TITLE_MAX_CHARS),
                IllegalArgumentException::new,
                "CHAT_RENAME_TITLE_TOO_LONG"
            ).asException();
        return loadOwnedSession(sessionId, userId).
            flatMap(
                session ->
                {
                    session.title       = normalized;
                    session.titleSource = AiChatSession.TITLE_SOURCE_MANUAL;
                    return session.persist().replaceWithVoid();
                }
            );
    }
    //endregion

    //region 辅助方法
    /**
     * 加载会话并校验归属.
     *
     * @implNote 不存在与越权一律以 "不存在" 同码同文案回应, 不泄露资源存在性, 防会话枚举越权.
     *           查找经 {@code Panache.withTransaction} 独立事务自持会话: SSE 流链 (Multi 返回值)
     *           无法使用 {@code @WithTransaction}, 无环境 Mutiny 会话, 裸 findById 曾抛
     *           "No current Mutiny.Session found" 500 (线上冒烟实证); 已有事务环境的调用点
     *           (listMessages/deleteSession) 则并入既有事务, 归属校验语义不变.
     */
    private static @NotNull Uni<AiChatSession> loadOwnedSession(@NotNull UUID sessionId, @NotNull UUID userId)
    {
        return Panache.withTransaction(
            () ->
            AiChatSession.
                <AiChatSession>findById(sessionId).
                onItem().
                ifNull().
                failWith(
                    () -> IBusinessException.of(
                        ErrorCode.SESSION_NOT_FOUND,
                        "会话不存在",
                        NoSuchElementException::new,
                        "CHAT_SESSION_LOOKUP_NOT_FOUND"
                    ).asException()
                ).
                flatMap(
                    session ->
                    session.userId.equals(userId) ?
                        Uni.createFrom().item(session) :
                        Uni.createFrom().failure(
                            IBusinessException.of(
                                ErrorCode.SESSION_NOT_FOUND,
                                "会话不存在",
                                NoSuchElementException::new,
                                "CHAT_SESSION_FOREIGN_ACCESS"
                            ).asException()
                        )
                )
        );
    }

    //* 加载已有 Session, 或创建新的 Session.
    private static @NotNull Uni<AiChatSession> getOrCreateSession(@Nullable UUID sessionId, @NotNull UUID userId)
    {
        if(sessionId == null)
        {
            final var session   = new AiChatSession();
            session.id               = UUID.randomUUID();
            session.userId           = userId;
            session.messages         = "[]";
            session.warningTriggered = false;
            session.updatedAt        = Instant.now();
            return Panache.withTransaction(session::persist).replaceWith(session);
        }
        return loadOwnedSession(sessionId, userId);
    }

    //* 流路径启动前缀产物: 脱管后的会话快照 + 同事务读取的风格指令块 (全 default 为空串) + 扩展情境块 (空串 = 无注入).
    private record StreamPreparation(@NotNull AiChatSession session, @NotNull String styleDirectives, @NotNull String extContext) {}

    //* 在独立事务中追加并持久化用户消息, 并在同一事务内顺带读取风格指令块 (避免额外事务往返),
    //* 风格落定后再收集扩展情境贡献 (纯外呼/内存计算, 不需要 DB 环境), 返回流链启动所需的 preparation 产物.
    //* 非 static: 历史截断需引用构造器注入的配置字段 maxHistoryMessages.
    private @NotNull Uni<StreamPreparation> appendUserMessage(@NotNull UUID sessionId, @NotNull UUID userId, @NotNull String content)
    {
        return Panache.withTransaction(
            () ->
            AiChatSession.
                <AiChatSession>findById(sessionId).
                onItem().
                ifNull().
                failWith(
                    () -> IBusinessException.of(
                        ErrorCode.SESSION_NOT_FOUND,
                        "会话不存在",
                        NoSuchElementException::new,
                        "CHAT_STREAM_SESSION_NOT_FOUND"
                    ).asException()
                ).
                flatMap(
                    s ->
                    {
                        s.addMessage("user", content);
                        s.truncate(maxHistoryMessages);
                        return s.persistAndFlush().
                            chain(_ -> loadStyleDirectives(userId)).
                            flatMap(directives ->
                                collectExtensionContext(userId).
                                    map(extContext -> new StreamPreparation(s, directives, extContext)));
                    }
                )
        );
    }

    //* 在独立事务中追加并持久化 AI 回复, 同时执行预警检测与推送.
    //! 预警检测 (外部 AI 调用, 秒级耗时) 在事务外先行完成, 结果传入事务内落库,
    //! 避免长时间占用 Hibernate reactive Session (与 streamMessage 不使用 @WithTransaction 的理由一致).
    //! 非 static: 内部调用实例方法 applyWarning (依赖 alertDispatchService 注入).
    private @NotNull Uni<Void> appendAssistantReply(@NotNull UUID sessionId, @NotNull String userContent, @NotNull String reply)
    {
        return detectWarning(userContent).flatMap(
            detection ->
            Panache.withTransaction(
                () ->
                AiChatSession.
                    <AiChatSession>findById(sessionId).
                    onItem().
                    ifNull().
                    failWith(
                        () -> IBusinessException.of(
                            ErrorCode.SESSION_NOT_FOUND,
                            "会话不存在",
                            NoSuchElementException::new,
                            "CHAT_STREAM_SESSION_NOT_FOUND"
                        ).asException()
                    ).
                    flatMap(
                        s ->
                        {
                            s.addMessage("assistant", reply);
                            s.truncate(maxHistoryMessages);
                            //* 预警检测在持久化前应用, 确保 warningTriggered 被一并落库.
                            applyWarning(s, detection);
                            return s.persistAndFlush().replaceWithVoid();
                        }
                    )
            )
        );
    }

    //* 在 worker 线程池启动 TokenStream, 桥接为 Multi 逐块推送.
    //! 流式路径裁定: emit 给前端的 token 保持原文, 拆流只作用于落库文本 (经 splitForStore) —
    //* 契约块是 HTML 注释, 前端 markdown 渲染下天然不可见, 与后端剥离构成双保险; 若缓冲到流结束再拆流,
    //* 须扣留全部 token, 既破坏逐字渲染体验, 流中断时已扣留内容还会整段丢失, 权衡后不采纳.
    private @NotNull Multi<String> streamAiReply(
        @NotNull AiChatSession session,
        @NotNull String content,
        boolean firstExchange,
        @NotNull String styleDirectives,
        @NotNull String extContext
    )
    {
        final var history = buildConversationHistory(session);
        return Multi.createFrom().<String>emitter(
            emitter ->
            {
                final var fullReply = new StringBuilder();
                empatheticChatAgent.chat(buildSystemPrompt(styleDirectives, extContext), session.userId.toString(), history, content).
                    onPartialResponse(
                        token ->
                        {
                            //* 累积与推送必须合并在同一回调内: TokenStream 每类回调仅允许注册一次,
                            //! 重复注册会在 start() 前抛 IllegalConfigurationException 导致流式端点静默断流.
                            fullReply.append(token);
                            emitter.emit(token);
                        }
                    ).
                    beforeToolExecution(
                        execution ->
                        //* 工具调用可见性 (用户裁定 2026-10-06): 回调恰在工具执行发起前触发 (langchain4j
                        //* ToolService#internalExecuteTool), 此刻把 tool-call 契约事件推给前端,
                        //* 思考指示切换为扩展自定义的进行时文案; 流式线程上 emitter 发射线程安全 (Mutiny 契约).
                        { emitter.emit(toolCallEvent(execution.request().name())); }
                    ).
                    onCompleteResponse(
                        _ ->
                        //* 回调线程为 langchain4j 流式线程, 无 Vertx 上下文, 直接执行响应式事务会失败;
                        //* 经 executeBlocking 切至 Vertx worker 线程 (与 callAiAndRespond 同一模式) 阻塞等待持久化完成.
                        {
                            final var split = splitForStore(fullReply.toString());
                            vertx.executeBlocking(
                                () ->
                                {
                                    appendAssistantReply(session.id, content, split.text()).await().atMost(Duration.ofSeconds(60));
                                    //* 评估落库与持久化同 worker 上下文串联 (前一事务已完成, 无嵌套冲突);
                                    //* 失败已内部归一为正常完成 (仅 WARN), await 仅保证上下文存活.
                                    recordClinicalAssessment(session, split.payload()).await().atMost(Duration.ofSeconds(60));
                                    return null;
                                },
                                false
                            ).subscribe().with(
                                _ ->
                                {
                                    //* 标题生成是流收尾后的 fire-and-forget 挂点: 不 await (LLM 秒级耗时绝不可延迟收流),
                                    //* 线程纪律由生成器内部自持 (duplicated context + executeBlocking).
                                    fireSessionTitle(session, firstExchange, content, split.text());
                                    //* 追问挂点与标题并行: 尾随事件在生成完成后补发, 收流让位至追问落定 (契约见 streamMessage).
                                    fireFollowupsTrailing(session, content, split.text(), emitter);
                                },
                                t ->
                                {
                                    LOG.warn("流式回复持久化失败: {}", t.getMessage());
                                    emitter.complete();
                                }
                            );
                        }
                    ).
                    onError(
                        error ->
                        {
                            LOG.warn("流式对话失败: {}", error.getMessage());
                            //* 降级与 send 路径对称 (冒烟发现: 原实现 fail 流导致前端收到 200 + 空流黑洞):
                            //* LLM 失败仍补发兜底文案并正常收流; 兜底文案同样落库, 持久化失败也照发 (与 send 语义一致).
                            vertx.executeBlocking(
                                () -> appendAssistantReply(session.id, content, FALLBACK_REPLY).await().atMost(Duration.ofSeconds(60)),
                                false
                            ).subscribe().with(
                                _ ->
                                {
                                    emitter.emit(FALLBACK_REPLY);
                                    //* 降级路径的首条助手回复同样已落库 (兜底文案): 首轮交换完成后照常触发标题挂点.
                                    fireSessionTitle(session, firstExchange, content, FALLBACK_REPLY);
                                    //* 降级路径的追问挂点与主路径对称: 兜底回复同为落库 assistant 消息, 生成失败自然无事件.
                                    fireFollowupsTrailing(session, content, FALLBACK_REPLY, emitter);
                                },
                                t ->
                                {
                                    LOG.warn("流式兜底持久化失败: {}", t.getMessage());
                                    emitter.emit(FALLBACK_REPLY);
                                    emitter.complete();
                                }
                            );
                        }
                    ).start();
            }
        ).runSubscriptionOn(Infrastructure.getDefaultWorkerPool());
    }

    /**
     * 流首 meta 事件: 会话绑定契约载荷.
     *
     * @param sessionId 实际使用的会话 ID (含新建会话)
     * @return meta 事件 JSON 文本, 形如 {@code {"type":"meta","sessionId":"<uuid>"}}
     * @since 1.5.0
     */
    //* 新前端据此直接绑定会话, 免除"回查会话列表取最新"的启发式竞态; 旧前端不消费该事件, 契约仅存在于本分支.
    private static @NotNull String metaEvent(@NotNull UUID sessionId)
    {
        return JsonUtils.toJson(Map.of("type", "meta", "sessionId", sessionId.toString()));
    }

    /**
     * 流中 tool-call 过程事件 (工具调用可见性): 会话契约载荷.
     *
     * @param toolName 工具命令名 (LLM 发起的调用动作)
     * @return tool-call 事件 JSON 文本, 形如 {@code {"type":"tool-call","name":"...","label":"..."}}
     * @since 2.2.1
     */
    //* 与 meta/followups 事件同款信封约定 (type 字段区分); 事件在工具执行发起时发出, 工具结果回灌后
    //* 流式分片自然恢复 — 事件只描述过程, 不携带工具输出 (工具产物只经 LLM 消化后进入回复正文).
    //* 非 static: label 解析需引用注入的扩展注册表.
    private @NotNull String toolCallEvent(@NotNull String toolName)
    {
        return JsonUtils.toJson(Map.of("type", "tool-call", "name", toolName, "label", toolCallLabel(toolName)));
    }

    /**
     * 解析工具命令名对应的展示文案: 注册表内命中的扩展以自身 {@code toolCallLabel()} 为准
     * (扩展自定义, 如课表 "正在查询课表…"), 未命中 (静态工具/未知命令) 回落默认文案.
     *
     * @param toolName 工具命令名
     * @return 前端思考指示展示的进行时文案, 恒非 null
     */
    private @NotNull String toolCallLabel(@NotNull String toolName)
    {
        for(final var view: extensionRegistry.tools())
            if(view.spec().command().equals(toolName))
                return view.extension().toolCallLabel();
        return IDataExtension.DEFAULT_TOOL_CALL_LABEL;
    }

    //* 单轮 AI 回复的完整产物: visible 供前端/历史, clinicalPayload 供拆流挂点评估落库 (null 即直通).
    private record AiReplyOutcome(@NotNull String visible, @Nullable JsonNode clinicalPayload) {}

    //* 调用 EmpatheticChatAgent 获取 AI 回复, 持久化并检测预警.
    //! HR000068/069: vertx.executeBlocking 在 worker 线程执行阻塞 AI 调用, 结果在事件循环回调,
    //! 之后的 session.persist() 才能安全使用请求上下文中的 Hibernate reactive Session.
    private @NotNull Uni<AiReplyOutcome> callAiAndRespond(
        @NotNull AiChatSession session,
        @NotNull String content,
        @NotNull String styleDirectives,
        @NotNull String extContext
    )
    {
        final var history = buildConversationHistory(session);
        return vertx.executeBlocking(() -> empatheticChatAgent.chatSync(buildSystemPrompt(styleDirectives, extContext), session.userId.toString(), history, content), false).
            onItem().transformToUni(
                reply ->
                {
                    final var split = splitForStore(reply);
                    session.addMessage("assistant", split.text());
                    session.truncate(maxHistoryMessages);
                    return detectWarning(content).
                        onItem().invoke(detection -> applyWarning(session, detection)).
                        flatMap(v -> session.persist().replaceWith(new AiReplyOutcome(split.text(), split.payload())));
                }
            ).
            onFailure().recoverWithUni(
                failure ->
                {
                    LOG.warn("AI 对话失败: {}", failure.getMessage());
                    session.addMessage("assistant", FALLBACK_REPLY);
                    session.truncate(maxHistoryMessages);
                    return session.persist().replaceWith(new AiReplyOutcome(FALLBACK_REPLY, null));
                }
            );
    }

    /**
     * 组装共情对话 systemPrompt: 机构/内置提示词在前, 用户风格块 (可选) 与扩展情境块 (可选) 居中,
     * 功能契约壳在后.
     * <p>组装顺序恒定: 安全序言 (基础提示词内嵌的安全规则节, 不可变) → 基础倾听者提示词 →
     * 风格块 (可选, 仅约束措辞与格式) → 扩展情境参考块 (可选, "当前情境参考") →
     * 结构化契约段 (clinical.tagging, 如有).</p>
     *
     * @param styleDirectives 用户聊天风格指令块 (五轴, 由 {@code StyleDirectiveBuilder} 产出;
     *                        全 default/无行/读取失败为空串 = 不插风格块)
     * @param extContext      扩展情境参考块 ({@code collectExtensionContext} 产物;
     *                        空串 = 无任何扩展贡献, 不插该块)
     * @return 合并后的 systemPrompt; 风格块与情境块均为空串且 {@code clinical.tagging=off} 时
     *         与基础提示词逐字节一致
     * @since 1.7.0 (userId 穿参随领域情境注入链退役而移除: 学生课表/考试/日程改经
     *         LLM 查询工具按需获取, 提示词不再预注入情境块);
     *         2.1.0 (五轴风格块注入: 风格只约束措辞与格式, 契约壳恒在风格块之后);
     *         2.2.0 (扩展情境块注入: "当前情境参考" 恒在风格块之后、契约段之前)
     */
    //* 合并规则: 契约壳首行声明最高优先级, 兜底机构提示词中"不要输出 JSON"之类指令对输出格式的破坏;
    //* 风格块哨兵句声明 "不得改变角色定位/安全守则/预警行为", 与契约壳同为措辞级附加段;
    //* 情境块哨兵句同款声明 — 情境只影响共情措辞, 绝不影响安全判定.
    private @NotNull String buildSystemPrompt(@NotNull String styleDirectives, @NotNull String extContext)
    {
        final var base = promptProvider.empatheticChat();
        //* 空串走恒等分支: 全 default 且无扩展贡献的组装结果与无注入的现状逐字节一致 (零回归面).
        var merged = base;
        if(!styleDirectives.isEmpty())
            merged = PrintUtils.quickFormat("{}\n\n{}", merged, styleDirectives);
        if(!extContext.isEmpty())
            merged = PrintUtils.quickFormat("{}\n\n{}", merged, extContext);
        if(!clinicalTagging)
            return merged;
        final var schema = resolveSchemaForContract();
        if(schema == null)
            return merged;//* 自定义结构无归一化缓存: 结构化增强暂禁, 仅发基础提示词 (+风格/情境块).
        return PrintUtils.quickFormat("{}\n\n{}", merged, PrintUtils.quickFormat(AiPromptConstants.CLINICAL_OUTPUT_CONTRACT, schema));
    }

    /**
     * 并行收集各数据扩展的情境贡献并拼装为 "当前情境参考" 块 (P3 注入挂点).
     *
     * @param userId 当前认证用户 ID
     * @return 情境块文本 (哨兵句 + 贡献合并, 总长截断封顶); 无任何贡献为空串 (调用方不插块)
     * @implNote <b>链路豁免</b>: 本方法只被共情链路 (send/stream 的 system prompt 组装) 调用;
     *           预警检测/标题生成/候选追问/副医生契约四链不收集情境 (与 P2 chat-style 同款豁免) —
     *           用户处境参考只影响共情措辞, 绝不影响安全判定与系统生成内容的口径.
     *           <b>fail-open</b>: null Uni / 超时 / 失败一律按 "无贡献" 降级 (SPI 契约 + 框架双保险),
     *           单扩展故障绝不阻断对话; 收集在事件循环链上并行执行 ({@code Uni.combine}),
     *           贡献 Uni 不触碰 DB, 无 Panache 会话要求.
     * @since 2.2.0
     */
    private @NotNull Uni<@NotNull String> collectExtensionContext(@NotNull UUID userId)
    {
        final var contributions = new ArrayList<Uni<String>>(extensionRegistry.all().size());
        for(final var extension: extensionRegistry.all())
        {
            final var contribution = extension.aiContextContribution(userId);//* null Uni = 扩展声明无贡献.
            if(contribution == null)
                continue;
            contributions.add(
                contribution.
                    ifNoItem().after(EXT_CONTRIBUTION_TIMEOUT).recoverWithItem(() -> null).
                    onFailure().invoke(t -> LOG.warn("扩展情境贡献失败, 按无贡献降级: ext={}, {}", extension.name(), t.getMessage())).
                    onFailure().recoverWithItem(() -> null)
            );
        }
        if(contributions.isEmpty())
            return Uni.createFrom().item("");
        //* join 而非 combine: 类型安全直收 List<String>; 各贡献已降级为项 (null), andCollectFailures 恒不触发.
        return Uni.join().all(contributions).andCollectFailures().map(ChatService::mergedContextBlock);
    }

    //* 合并各扩展贡献为情境块: 剥空白去 null, 全空收敛空串 (不插块), 非空拼哨兵句并整体截断封顶.
    private static @NotNull String mergedContextBlock(@NotNull List<String> items)
    {
        final var joined = items.stream().
            filter(Objects::nonNull).
            map(String::strip).
            filter(s -> !s.isEmpty()).
            collect(java.util.stream.Collectors.joining("\n")).
            strip();
        if(joined.isEmpty())
            return "";
        final var body = joined.length() <= EXT_CONTEXT_MAX_CHARS ? joined : joined.substring(0, EXT_CONTEXT_MAX_CHARS);
        return PrintUtils.quickFormat("{}\n{}", AiPromptConstants.CHAT_EXT_CONTEXT_PREAMBLE, body);
    }

    /**
     * 读取用户五轴风格指令块 (无行/全 default 为空串).
     *
     * @param userId 用户 ID
     * @return 风格块文本; 空串表示不注入
     * @implNote 仅在既有事务上下文内调用 (send 主事务 / stream 的 appendUserMessage 事务),
     *           不自开事务; 无行按空串收敛而非懒建行, 风格缺失绝不阻断对话主链路.
     * @since 2.1.0
     */
    private static @NotNull Uni<@NotNull String> loadStyleDirectives(@NotNull UUID userId)
    {
        //* findById 无行即 null 项 (Uni 允许 null): map 直收 null 交 build 归一 — 不走 ifNull().continueWith,
        //! 其 supplier 契约拒绝 null 返回值 (500 "The supplier returned null", 集成测试实证).
        return UserChatStyle.<UserChatStyle>findById(userId).map(StyleDirectiveBuilder::build);
    }

    /**
     * 解析可下发的结构化契约结构定义.
     *
     * @return 默认 canonical 结构免归一化零成本直用 (回滚即永久稳定); 自定义结构必须命中归一化缓存
     *         才允许上线 — 未经归一化的自由文本绝不下发; 未命中 (启动期归一化未成功) 时为 {@code null},
     *         一次性 WARN 留痕后等下次启动重试 (缓存查询不触发 LLM, 请求路径零外呼)
     * @since 1.1.0
     */
    private @Nullable String resolveSchemaForContract()
    {
        final var effective = promptProvider.clinicalSchema();
        if(AiPromptConstants.CLINICAL_OUTPUT_SCHEMA_DEFAULT.equals(effective))
            return effective;
        final var normalized = schemaNormalizer.cachedFor(ClinicalSchemaNormalizer.sha256Hex(effective));
        if(normalized == null && schemaSuspendedWarned.compareAndSet(false, true))
            LOG.warn("自定义临床结构定义尚无归一化缓存, 结构化输出增强暂禁 (仅发基础提示词), 等下次启动重试归一化");
        return normalized;
    }

    /**
     * 落库前拆流: {@code clinical.tagging=on} 时剥离回复末尾的 soulnotes 结构化块,
     * 防止契约块在多轮历史间重复累积 (省 token); off 时原样透传不拆 (payload 恒 null).
     *
     * @param reply LLM 原始回复
     * @return 剥离后正文与结构化载荷; payload 为 null 表示 tagging off / 无块 / 解析失败,
     *         评估落库挂点对 null 零开销直通
     * @since 1.1.0
     */
    private @NotNull ClinicalOutputSplitter.SplitResult splitForStore(@NotNull String reply)
    {
        if(!clinicalTagging)
            return new ClinicalOutputSplitter.SplitResult(reply, null);
        final var result = ClinicalOutputSplitter.split(reply);
        if(result.payload() != null)
            LOG.debug("soulnotes 结构化负载: {}", result.payload());
        return result;
    }

    //* fire-and-forget 落库: 拆流 payload 为 null (tagging off / 无块 / 解析失败) 时零开销直通;
    //* 失败仅 WARN — 对话可用性 > 评估完整性 (Spec §7 best-effort 边界).
    //* send 挂点经此出口订阅即弃 (响应映射不等落库); stream 挂点直接 await 记录 Uni 保活 worker 上下文.
    private void fireClinicalRecord(@NotNull AiChatSession session, @Nullable JsonNode payload) { recordClinicalAssessment(session, payload).subscribe().with(v -> {}); }

    /**
     * 会话标题 fire-and-forget 挂点: 仅当本轮是该会话的首轮交换且标题尚缺时触发
     * (send/stream 两路径收口); 生成器内部 fail-open 自持线程纪律, 本方法零阻塞零抛出.
     *
     * @implNote 标题生成含秒级 LLM 调用, 绝不允许进入 SSE 流的 await 链 — 调用点一律放在
     *           回复持久化完成与流收尾之后, 订阅即弃 (SessionTitleGenerator 契约恒成功完成).
     */
    private void fireSessionTitle(@NotNull AiChatSession session, boolean firstExchange, @NotNull String userContent, @NotNull String assistantReply)
    {
        //* 非首轮 (历史续聊) 或已有标题 (存量为 null 才生成): 双重闸门, 避免无谓的外呼.
        if(!firstExchange || session.title != null)
            return;
        sessionTitleGenerator.fire(session.id, userContent, assistantReply);
    }

    /**
     * 候选追问 fire-and-forget 挂点 (非流式 send 路径): 每轮回复落库后触发, 与标题挂点并行;
     * 生成器内部 fail-open 自持线程纪律, 本方法零阻塞零抛出.
     *
     * @implNote 追问与标题不同: 无首轮/幂等闸门, 每轮 assistant 回复均触发 (SSE 契约"恰好 0-3 条"
     *           的 0 即来自生成失败/解析不合规的轮次).
     */
    private void fireFollowups(@NotNull AiChatSession session, @NotNull String userContent, @NotNull String assistantReply)
    {
        followupGenerator.fire(session.id, userContent, assistantReply);
    }

    /**
     * 候选追问尾随事件挂点 (流式 stream 路径): 回复落库后触发, 生成完成后补发
     * {@code followups} 尾随事件再收流 — 生成失败/空产物则静默直接收流.
     *
     * @implNote 追问生成含二次 LLM 调用, 只推迟收流不阻塞 token 推送 (token 已全部发出);
     *           订阅回调运行在生成器的 duplicated context 上, emitter 发射线程安全.
     *           生成器契约恒成功完成, 订阅级失败分支仅防 emitter 永不收流的意外实现缺陷.
     */
    private void fireFollowupsTrailing(
        @NotNull AiChatSession session,
        @NotNull String userContent,
        @NotNull String assistantReply,
        @NotNull MultiEmitter<? super String> emitter
    )
    {
        followupGenerator.generateFor(session.id, userContent, assistantReply).
            subscribe().with(
                items ->
                {
                    if(!items.isEmpty())
                        emitter.emit(followupEvent(items));
                    emitter.complete();
                },
                t ->
                {
                    LOG.warn("候选追问尾随事件执行失败 (订阅级兜底): sessionId={}, {}", session.id, t.getMessage());
                    emitter.complete();
                }
            );
    }

    /**
     * 流尾随候选追问事件: 会话契约载荷.
     *
     * @param items 追问产物 (恰好 3 条, 由生成器归一化保证)
     * @return followups 事件 JSON 文本, 形如 {@code {"type":"followups","items":["...","...","..."]}}
     * @since 1.8.0
     */
    //* 与 meta 事件同款信封约定 (type 字段区分), 前端以 JSON 解析判定契约事件、纯文本一律视为 token.
    private static @NotNull String followupEvent(@NotNull List<String> items)
    {
        return JsonUtils.toJson(Map.of("type", "followups", "items", items));
    }

    //* 落库 Uni 构造 (两挂点共享, 各自恰好订阅一次): 失败在内部归一为正常完成 — 订阅方无需失败分支.
    private @NotNull Uni<Void> recordClinicalAssessment(@NotNull AiChatSession session, @Nullable JsonNode payload)
    {
        if(payload == null)
            return Uni.createFrom().voidItem();
        return clinicalAssessmentService.recordAsync(session.userId, session.id, payload, currentSchemaHash()).
            onFailure().invoke(f -> LOG.warn("临床评估落库失败: userId={}, session={}, {}", session.userId, session.id, f.getMessage())).
            onFailure().recoverWithItem(() -> null);
    }

    //* 当前下发契约的归一化指纹: 语义必须与 buildSystemPrompt 的下发判定严格一致 —
    //* canonical 或 "结构增强暂禁" (未命中缓存) 均未下发自定义结构 → null; 仅已下发的自定义结构才有指纹.
    private @Nullable String currentSchemaHash()
    {
        if(!clinicalTagging)
            return null;
        final var effective = promptProvider.clinicalSchema();
        if(AiPromptConstants.CLINICAL_OUTPUT_SCHEMA_DEFAULT.equals(effective))
            return null;
        //* 指纹只算一次: 三目两侧各调一次 sha256Hex 是纯重复计算 (与 resolveSchemaForContract 下发判定的重复不同, 那处跨方法边界).
        final var hash = ClinicalSchemaNormalizer.sha256Hex(effective);
        return schemaNormalizer.cachedFor(hash) == null ? null : hash;
    }

    //* 对用户最新消息执行预警等级检测.
    //! WarningDetectionAgent 的 detect 是同步阻塞调用, 直接在事件循环线程调用会触发
    //! BlockingNotAllowedException 被静默吞掉, 导致 warningTriggered 永远为 false —
    //! 必须经 vertx.executeBlocking 在 worker 线程池执行.
    //! 检测对象为用户消息而非 AI 回复: 共情回复会复述用户的痛苦内容, 以回复为对象会产生误报.
    private @NotNull Uni<@Nullable WarningDetectionResult> detectWarning(@NotNull String userContent)
    {
        return vertx.executeBlocking(() -> warningDetectionAgent.detect(promptProvider.warningDetection(), userContent), false).
            onFailure().invoke(t -> LOG.warn("预警检测失败: {}", t.getMessage())).
            //* 预警检测失败不阻塞主对话流程, 降级为无预警 (null).
            onFailure().recoverWithItem(() -> null);
    }

    //* 依据检测结果标记会话预警位, RED 等级经 AlertDispatchService 统一分发 (per-user 冷却闸门
    //* + 逐渠道 fire-and-forget 推送热线) — 冷却只闸门外呼, 落库标记不受影响.
    //! 必须在持久化前调用 (受管 Session), 确保 warningTriggered 随消息一并落库.
    private void applyWarning(@NotNull AiChatSession session, @Nullable WarningDetectionResult detection)
    {
        if(detection == null)
            return;
        if("RED".equals(detection.warningLevel()))
        {
            session.warningTriggered = true;
            //* Uni 是惰性的, 必须订阅才真正触发分发; dispatchRed 契约恒成功完成 (冷却判定/渠道推送失败
            //! 全部内部收口 WARN), 订阅级兜底仅防意外实现缺陷, 不允许预警分发拖垮会话主流程.
            alertDispatchService.dispatchRed(session.userId, detection.reason()).
                subscribe().with(
                    v -> {},
                    t -> LOG.warn("RED 预警分发执行失败: userId={}, {}", session.userId, t.getMessage())
                );
        }
        else if("YELLOW".equals(detection.warningLevel()))
            session.warningTriggered = true;
    }

    //* 非法/空白 sessionId 视为新会话.
    private static @Nullable UUID parseSessionId(@Nullable String sessionId)
    {
        if(sessionId == null || sessionId.isBlank())
            return null;
        try { return UUID.fromString(sessionId); }
        catch(IllegalArgumentException e) { return null; }//! 非法 UUID 回退为新会话, 避免入口崩溃.
    }

    //* 将 Session 中的消息列表格式化为对话历史文本 (用于 AI 输入).
    //* 非 static: 滚动上限来自构造器注入的配置字段 maxHistoryMessages.
    private @NotNull String buildConversationHistory(@NotNull AiChatSession session)
    {
        if(session.messages == null || session.messages.isBlank())
            return "";
        try
        {
            final var messages = JsonUtils.parseJson(session.messages, new TypeReference<List<Map<String, String>>>() {});
            final var sb       = new StringBuilder();
            final var start    = Math.max(0, messages.size() - maxHistoryMessages);
            for(var i = start; i < messages.size(); i++)
            {
                final var msg     = messages.get(i);
                final var role    = msg.getOrDefault("role", "unknown");
                final var content = msg.getOrDefault("content", "");
                sb.append(PrintUtils.quickFormat("{}: {}\n", role, content));
            }
            return sb.toString();
        }
        catch(Exception e)
        {
            LOG.warn("构建对话历史失败: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 解析会话消息 JSON 为历史条目列表 (按对话顺序).
     *
     * @param messagesJson 会话消息 JSONB 原文
     * @return 消息条目列表; 空白/损坏 JSON 按空列表降级 (与预览/计数同款容错)
     * @since 1.5.0 (透传条目 ts 时间戳; 存量两键行无 ts 时为 null, 不做解析与回填)
     */
    private static @NotNull List<ChatHistoryMessage> parseHistory(@Nullable String messagesJson)
    {
        if(messagesJson == null || messagesJson.isBlank())
            return List.of();
        try
        {
            return JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() {}).
                stream().
                map(m -> new ChatHistoryMessage(m.getOrDefault("role", "unknown"), m.getOrDefault("content", ""), m.get("ts"), AiChatSession.followupsOf(m))).
                toList();
        }
        catch(Exception e)
        {
            LOG.warn("解析会话消息历史失败: {}", e.getMessage());
            return List.of();
        }
    }

    //* 使用 JsonUtils 解析 messages JSON 数组, 返回消息条数.
    private static int countMessages(String messagesJson)
    {
        if(messagesJson == null || messagesJson.isBlank())
            return 0;
        try { return JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() { }).size(); }
        catch(Exception e) { LOG.warn("解析 messages JSON 获取消息数失败: {}", e.getMessage()); return 0; }
    }

    //* 使用 JsonUtils 解析 messages JSON 数组, 提取最后一条消息的 content 作为预览.
    //* 空字符串 "" 是合理选择, 用于 VO 展示前端, 表示"无预览内容".
    //! 不应使用 null (导致前端判空) 或 Optional (VO 字段不应包装 Optional).
    private static @NotNull String getPreview(String messagesJson)
    {
        if(messagesJson == null || messagesJson.isBlank())
            return "";
        try
        {
            final var messages = JsonUtils.parseJson(messagesJson, new TypeReference<List<Map<String, String>>>() { });
            if(messages.isEmpty())
                return "";
            final var lastContent = messages.getLast().get("content");
            if(lastContent == null || lastContent.isBlank())
                return "";
            return lastContent.length() > 50 ? PrintUtils.quickFormat("{}...", lastContent.substring(0, 50)) : lastContent;
        }
        catch(Exception e) { LOG.warn("解析 messages JSON 获取预览失败: {}", e.getMessage()); return ""; }
    }

    //endregion
}
