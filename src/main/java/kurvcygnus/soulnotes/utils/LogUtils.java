package kurvcygnus.soulnotes.utils;

import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LogUtils
{
    private LogUtils() { throw new IllegalAccessError(); }
    
    private static final StackWalker STACK_WALKER = StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE);
    
    /**
     * 获取一个 <u>{@link Logger}</u> 实例.
     * @apiNote 该获取通过 <u>{@link StackWalker}</u> 获取调用者信息, 以此解决 <u>{@link LoggerFactory#getLogger(Class)}</u> 中反复填写 {@code Class<?>}
     * 的重复劳动, 以及潜在的重构参数错误问题.<br>
     * 由于该方法需获取调用者信息, <span style="color: f84b4b">因此这个方法不可以被再次包装.</span>
     */
    public static @NotNull Logger getLogger() { return LoggerFactory.getLogger(STACK_WALKER.getCallerClass()); }
}
