package kurvcygnus.soulnotes.domain.extension;

import io.smallrye.mutiny.Uni;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.UUID;

/**
 * 数据扩展 SPI (spec §3): 第三方实现本接口、以 CDI bean 形式扔进 classpath 即完成接入 —
 * 数据自动获得两个出口: REST 查阅端点 ({@code /api/v1/ext/{name}/query}) 与 LLM 可调用工具
 * (经 {@link LLMToolSpec} 描述, ExtensionToolProvider 动态注册).
 *
 * @param <D> 数据类型 (查阅产出; REST 按 Jackson 序列化, LLM 工具按 JSON 文本回传)
 * @param <A> 查询参数类型 (REST body / LLM 工具参数反序列化目标; 经 {@link #argsType()} 显式声明类型令牌)
 * @implNote <b>userId 服务端注入</b>: 恒为 JWT subject, 客户端不可控 — args 里不允许出现任何身份字段.
 *           <b>fail-open 自持</b>: 实现方任何失败自行降级 (空集/默认值), 绝不外抛; 框架另有兜底缝
 *           (REST 错误外壳 / LLM 固定降级文本), 双保险不等于可抛.
 *           <b>注册</b>: 标 {@code @ApplicationScoped} 即被 ExtensionRegistry 构建期收集 (D1);
 *           {@code name()} 全注册表唯一, {@code argsType()} 与 {@code aiCallCommand().parameters()}
 *           的对齐由启动校验把关 (D4).
 * @since 1.7.0
 */
public interface IDataExtension<D, A>
{
    /**
     * 扩展 ID: REST 路径段 + 工具命名空间.
     *
     * @return 格式 {@code ^[a-z][a-z0-9-]*$}, 全注册表唯一 (启动校验)
     */
    @NotNull String name();

    /**
     * 查询参数类型令牌 (泛型擦除后 Jackson 反序列化的显式依据).
     *
     * @return A 的 Class
     */
    @NotNull Class<A> argsType();

    /**
     * 查阅实现 — REST 与 LLM 工具共用的唯一执行体 (D2).
     *
     * @implNote 框架对本方法<b>不设超时</b>: 情境贡献 300ms / 通知规则 2s 的超时保护均不覆盖 query —
     *           挂死的实现会阻塞 LLM 工具循环与 REST worker 线程, 实现方必须自保非阻塞性/快速返回
     *           (外呼型实现请自行施加超时与降级, 内置扩展以纯静态数据满足该约束).
     * @param userId 用户 ID (JWT subject, 服务端注入)
     * @param args   查询参数 (已反序列化)
     * @return 数据产出; 恒非 null (无数据语义以空集/空对象表达)
     */
    @NotNull D query(@NotNull UUID userId, @NotNull A args);

    /**
     * LLM 工具契约描述.
     *
     * @return 工具描述; {@code null} = 本扩展不暴露给 LLM (仅 REST 出口)
     */
    @Nullable LLMToolSpec aiCallCommand();

    /**
     * 工具调用过程展示文案 (工具调用可见性, 用户裁定 2026-10-06): LLM 发起本扩展工具调用时,
     * SSE 以 {@code {"type":"tool-call","name":...,"label":...}} 事件下发, 前端把 label 显示在
     * 消息元信息行的思考指示中 (替换默认的 "思考中" 微光文本), 让等待过程可感知.
     */
    //* 默认文案对未覆盖实现兜底; 事件缺失时前端回落 "思考中", 两条降级缝互不依赖.
    String DEFAULT_TOOL_CALL_LABEL = "正在查询资料…";

    /**
     * 工具调用过程展示文案.
     *
     * @return 发起本扩展工具调用时前端展示的进行时文案 (如 "正在查询课表…")
     */
    default @NotNull String toolCallLabel() { return DEFAULT_TOOL_CALL_LABEL; }

    //region 主动挂点 (P3 Task 1: 提示词注入 + 通知)
    /**
     * 情境贡献 (P3): 每条用户消息进入共情链路前, 框架并行收集各扩展的本方法产物,
     * 以 "当前情境参考" 块注入 system prompt (风格块之后, 契约段之前) —
     * 让 AI 无需等 LLM 主动调工具即持有用户的近期处境.
     *
     * @param userId 用户 ID (JWT subject, 服务端注入)
     * @return 贡献文本的 Uni; {@code null} Uni 或 null/空白项均表达 "本扩展无贡献" (不产生注入块);
     *         框架侧每扩展 300ms 超时 + 失败降级无贡献 (fail-open), 实现方仍应自持失败不外抛
     * @implNote 只进共情链路; 预警/标题/追问/副医生契约四链不收集 (与 P2 chat-style 同款豁免) —
     *           风格与情境只影响共情措辞, 绝不影响安全判定语义.
     * @since 2.2.0
     */
    default @Nullable Uni<String> aiContextContribution(@NotNull UUID userId) { return null; }

    /**
     * 通知规则 (P3): 扩展侧自算到期窗口 (计算逻辑在扩展内), 回报 "此刻应下发" 的规则列表;
     * 调度器只负责幂等去重与 WS 下发.
     *
     * @param userId 用户 ID (JWT subject, 服务端注入)
     * @return 到期规则列表的 Uni; 空集 = 本扩展此刻无到期通知; 框架侧超时/失败降级空集 (fail-open),
     *         实现方仍应自持失败不外抛
     * @since 2.2.0
     */
    default @NotNull Uni<List<ExtensionNotificationRule>> notificationRules(@NotNull UUID userId)
    { return Uni.createFrom().item(List.of()); }
    //endregion
}
