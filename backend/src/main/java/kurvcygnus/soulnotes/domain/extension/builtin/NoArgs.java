package kurvcygnus.soulnotes.domain.extension.builtin;

/**
 * 无参查询标记 (内置 campus 三扩展共用): 演示数据与查询条件无关, 空对象 {@code "{}"} 即可反序列化.
 * <p>独立顶层类型而非内嵌标记 — {@link kurvcygnus.soulnotes.domain.extension.IDataExtension#argsType()}
 * 需要显式 Class 令牌, 且 REST/LLM 两出口共用同一反序列化目标.</p>
 * @since 1.7.0
 */
public record NoArgs() {}
