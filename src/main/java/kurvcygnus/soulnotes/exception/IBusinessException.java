package kurvcygnus.soulnotes.exception;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * <b>业务异常门面接口</b>，作为本系统中所有业务异常的 <b>公共抽象</b>。<br>
 * 继承 {@link IStructuredThrowable} 以具备结构化标签和原因链能力，
 * 追加 {@link #getErrorCode()} 以传递统一错误码，供前端展示友好的错误提示。
 * 使用 CRTP 自类型参数 {@code T} 保留具体实现类型，{@link #asThrowable()} 提供 Throwable 桥接。<hr>
 * <p><b>使用方式:</b> 通过静态工厂方法构造实例，调用方只需依赖此接口：</p>
 * <pre>{@code
 * throw IBusinessException.of(ErrorCode.USER_NOT_FOUND);
 * throw IBusinessException.of(ErrorCode.BAD_REQUEST, someData);
 * throw IBusinessException.of(ErrorCode.AUTH_UNAUTHORIZED, "自定义详情消息");
 * }</pre>
 *
 * @param <T> 自类型参数，绑定为 {@code Throwable & IBusinessException}<wbr>{@code <T>}，保证可抛出
 * @author Kurv Cygnus & Claude Code
 * @see ErrorCode
 * @see HolderException
 * @see DataHolderException
 * @since 1.1
 */
public interface IBusinessException<T extends Throwable & IBusinessException<T>> extends IStructuredThrowable
{
    /**
     * 返回统一错误码。
     * @return 错误码枚举，永不为 null
     */
    @NotNull ErrorCode getErrorCode();

    /**
     * 以具体自类型 {@code T} 返回当前实例，提供安全的 Throwable 桥接。<br>
     * 当方法签名中仅持有 {@code IBusinessException<?>} 引用且需要抛出时使用。
     * @return 转型为 {@code T} 后的自身
     */
    @SuppressWarnings("unchecked")//! CRTP：T 绑定为具体实现类型，转型安全。
    default @NotNull T asThrowable() { return (T) this; }

    //region 静态工厂

    /**
     * <span style="color: 95cc6d">创建仅携带错误码的业务异常。</span>
     *
     * @param errorCode 统一错误码
     * @return 业务异常实例（{@link HolderException}，可直接 {@code throw}）
     */
    static @NotNull HolderException of(@NotNull ErrorCode errorCode)
    {
        return new HolderException(errorCode, errorCode.getMessage(), errorCode.name());
    }

    /**
     * <span style="color: 95cc6d">创建携带错误码和附加数据的业务异常。</span>
     *
     * @param errorCode 统一错误码
     * @param data      附加的上下文数据（可为 null）
     * @return 业务异常实例（{@link DataHolderException}，可直接 {@code throw}）
     */
    static @NotNull HolderException of(@NotNull ErrorCode errorCode, @Nullable Object data)
    {
        return new DataHolderException(errorCode, errorCode.getMessage(), errorCode.name(), data);
    }

    /**
     * <span style="color: 95cc6d">创建携带错误码和自定义详情消息的业务异常。</span>
     *
     * @param errorCode 统一错误码
     * @param detail    自定义详情消息（将作为异常的 message）
     * @return 业务异常实例（{@link HolderException}，可直接 {@code throw}）
     */
    static @NotNull HolderException of(@NotNull ErrorCode errorCode, @NotNull String detail)
    {
        return new HolderException(errorCode, detail, errorCode.name());
    }

    /**
     * <span style="color: 95cc6d">创建完全自定义的业务异常，携带有意义的调试标签。</span>
     *
     * @param errorCode 统一错误码
     * @param detail    异常详情消息
     * @param tag       有调试意义的语义标签（而非枚举名）
     * @param data      附加的上下文数据（可为 null）
     * @return 业务异常实例（{@link DataHolderException}，可直接 {@code throw}）
     */
    static @NotNull HolderException of(
        @NotNull ErrorCode errorCode,
        @NotNull String detail,
        @NotNull String tag,
        @Nullable Object data
    )
    {
        return new DataHolderException(errorCode, detail, tag, data);
    }

    //endregion
}
