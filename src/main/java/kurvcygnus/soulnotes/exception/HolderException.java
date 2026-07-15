package kurvcygnus.soulnotes.exception;

import org.jetbrains.annotations.NotNull;

/**
 * <b>承载 {@link ErrorCode} 的结构化业务异常基类</b>，package-private（对外不可见）。<br>
 * 作为 {@link IBusinessException} 的默认实现，提供错误码和调试标签。<hr>
 * <p><b>设计说明:</b></p>
 * <ul>
 *     <li>继承 {@link StructuredException} 并实现 {@link IBusinessException}</li>
 *     <li>持有 {@link ErrorCode} 字段，{@link #causeData()} 返回该错误码</li>
 *     <li>如需携带附加数据，请使用唯一子类 {@link DataHolderException}</li>
 *     <li>构造时强制要求 {@code tag} 参数，避免使用无意义的枚举名作为标签</li>
 * </ul>
 *
 * @see IBusinessException
 * @see DataHolderException
 */
public class HolderException extends StructuredException implements IBusinessException<HolderException>, IDetailedThrowable<HolderException, Object>
{
    private final @NotNull ErrorCode errorCode;

    /**
     * 构造持有错误码的结构化业务异常。
     *
     * @param errorCode 统一错误码
     * @param message   异常详情消息
     * @param tag       有调试意义的语义标签（如 {@code "AUTH_LOGIN"}、{@code "DIARY_CREATE"}）
     */
    HolderException(@NotNull ErrorCode errorCode, @NotNull String message, @NotNull String tag)
    {
        super(message, tag);
        this.errorCode = errorCode;
    }

    @Override public final @NotNull ErrorCode getErrorCode() { return errorCode; }

    /**
     * {@inheritDoc}
     * 默认返回 {@link #getErrorCode()} 作为原因数据。
     */
    @Override public @NotNull Object causeData() { return errorCode; }
}
