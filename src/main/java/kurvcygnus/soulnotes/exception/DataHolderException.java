package kurvcygnus.soulnotes.exception;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * <b>携带附加数据的业务异常</b>，package-private（对外不可见）。<br>
 * 在 {@link HolderException} 的基础上追加 {@code data} 字段，
 * 用于传递非法输入值、失败实体 ID 等上下文负载。<hr>
 * <p><b>设计说明:</b></p>
 * <ul>
 *     <li>作为 {@link HolderException} 的唯一子类</li>
 *     <li>{@link #causeData()} 返回附加的 {@code data} 而非 {@link ErrorCode}</li>
 *     <li>通过 {@link IBusinessException#of(ErrorCode, Object)} 等工厂方法创建</li>
 * </ul>
 *
 * @see IBusinessException
 * @see HolderException
 */
final class DataHolderException extends HolderException
{
    private final @Nullable Object data;

    /**
     * 构造携带附加数据的业务异常。
     *
     * @param errorCode 统一错误码
     * @param message   异常详情消息
     * @param tag       有调试意义的语义标签
     * @param data      附加的上下文数据（可为 null）
     */
    DataHolderException(@NotNull ErrorCode errorCode, @NotNull String message, @NotNull String tag, @Nullable Object data)
    {
        super(errorCode, message, tag);
        this.data = data;
    }

    /**
     * {@inheritDoc}
     * 返回附加的上下文数据而非 {@link ErrorCode}。
     */
    @Override public @NotNull Object causeData() { return data; }
}
