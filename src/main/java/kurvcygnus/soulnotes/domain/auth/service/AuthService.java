package kurvcygnus.soulnotes.domain.auth.service;

import io.quarkus.hibernate.reactive.panache.common.WithTransaction;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import kurvcygnus.soulnotes.domain.auth.dto.AuthResponse;
import kurvcygnus.soulnotes.domain.auth.dto.LoginRequest;
import kurvcygnus.soulnotes.domain.auth.dto.RegisterRequest;
import kurvcygnus.soulnotes.domain.auth.entity.User;
import kurvcygnus.soulnotes.exception.IBusinessException;
import kurvcygnus.soulnotes.exception.ErrorCode;
import kurvcygnus.soulnotes.utils.PrintUtils;
import kurvcygnus.soulnotes.utils.enums.UserRole;
import org.jetbrains.annotations.NotNull;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.NoSuchElementException;

/**
 * <b>认证服务</b>
 * <ul>
 *     <li>注册: 检查用户名唯一性 → 密码哈希 → 创建用户 → 签发 Token</li>
 *     <li>登录: 查找用户 → 密码校验 → 签发 Token</li>
 *     <li>登出: 将 Token 加入 Redis 黑名单</li>
 * </ul>
 *
 * @author Claude Code
 * @since 1.0
 */
@ApplicationScoped
public final class AuthService
{
    //region 注入
    private final @NotNull TokenService tokenService;

    public AuthService(@NotNull TokenService tokenService) { this.tokenService = tokenService; }
    //endregion

    //region 核心业务
    /**
     * <span style="color: 95cc6d">用户注册.</span>
     *
     * @param req 注册请求
     * @return 认证成功响应 (含 Token)
     */
    @WithTransaction public @NotNull Uni<AuthResponse> register(@NotNull RegisterRequest req)
    {
        //* 角色提权防护: 注册仅允许 STUDENT, 忽略/拒绝客户端传入的管理员等角色.
        if(req.role() != UserRole.STUDENT)
            return Uni.createFrom().failure(
                IBusinessException.of(
                    ErrorCode.BAD_REQUEST,
                    "注册仅允许 STUDENT 角色",
                    IllegalArgumentException::new,
                    "AUTH_REGISTER_ROLE_NOT_ALLOWED"
                ).asException()
            );

        return User.findByUsername(req.username()).
            onItem().ifNotNull().failWith(
                () -> IBusinessException.of(
                    ErrorCode.USERNAME_DUPLICATE,
                    "用户名已被占用",
                    RuntimeException::new,
                    "AUTH_REGISTER_USERNAME_CONFLICT"
                ).asException()
            ).
            onItem().ifNull().switchTo(createUser(req)).
            flatMap(
                user ->
                {
                    final var token = tokenService.generateToken(user);
                    return Uni.createFrom().item(new AuthResponse(token, user.id, user.username, user.role));
                }
            );
    }

    /**
     * <span style="color: 95cc6d">用户登录.</span>
     *
     * @param req 登录请求
     * @return 认证成功响应 (含 Token)
     */
    @WithTransaction public @NotNull Uni<AuthResponse> login(@NotNull LoginRequest req)
    {
        return User.findByUsername(req.username()).
            onItem().ifNull().failWith(
                () -> IBusinessException.of(
                    ErrorCode.USER_NOT_FOUND,
                    "用户不存在",
                    NoSuchElementException::new,
                    "AUTH_LOGIN_USER_NOT_FOUND"
                ).asException()
            ).
            flatMap(
                user ->
                {
                    if(!verifyPassword(req.password(), user.passwordHash))
                        return Uni.createFrom().failure(
                            IBusinessException.of(
                                ErrorCode.AUTH_UNAUTHORIZED,
                                "密码错误",
                                IllegalStateException::new,
                                "AUTH_LOGIN_PASSWORD_MISMATCH"
                            ).asException()
                        );
                    final var token = tokenService.generateToken(user);
                    return Uni.createFrom().item(new AuthResponse(token, user.id, user.username, user.role));
                }
            );
    }

    /**
     * <span style="color: 95cc6d">用户登出 (将 Token 加入黑名单).</span>
     *
     * @param token JWT Token
     * @return {@link Uni<Void>}
     */
    public @NotNull Uni<Void> logout(@NotNull String token) { return tokenService.invalidateToken(token); }
    //endregion

    //region 辅助方法
    //* 密码最小长度.
    private static final int MIN_PASSWORD_LENGTH = 8;

    //* 使用 SHA-256 作为临时密码哈希方案.
    //! 生产环境必须替换为 BCrypt, 当前方案仅用于原型阶段.
    //? 等到 BCrypt 依赖 (如 spring-security-crypto / jbcrypt) 加入后, 更新此方法.
    private static @NotNull String hashPassword(@NotNull String password)
    {
        try
        {
            final var digest = MessageDigest.getInstance("SHA-256");
            final var hash = digest.digest(password.getBytes());
            return HexFormat.of().formatHex(hash);
        }
        catch(NoSuchAlgorithmException e) { throw new RuntimeException("SHA-256 不可用", e); }
    }

    private static boolean verifyPassword(@NotNull String rawPassword, @NotNull String storedHash) { return hashPassword(rawPassword).equals(storedHash); }
    
    //* 校验密码强度: 至少 8 位, 包含字母和数字.
    private static @NotNull Uni<User> createUser(@NotNull RegisterRequest req)
    {
        final var password = req.password();
        
        if(password.length() < MIN_PASSWORD_LENGTH)
            throw IBusinessException.of(
                ErrorCode.BAD_REQUEST,
                PrintUtils.quickFormat("密码长度不能少于{}位", MIN_PASSWORD_LENGTH),
                IllegalArgumentException::new,
                "AUTH_REGISTER_WEAK_PASSWORD_LENGTH"
            ).asException();
        if(
            !password.matches(".*[a-zA-Z].*") ||
            !password.matches(".*\\d.*") ||
            !password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?].*")
        ) throw IBusinessException.of(
            ErrorCode.BAD_REQUEST,
            "密码必须包含字母、数字和特殊字符",
            IllegalArgumentException::new,
            "AUTH_REGISTER_WEAK_PASSWORD_COMPLEXITY"
        ).asException();
        
        final var user = User.create(req.username(), hashPassword(req.password()), req.role());
        return user.persistAndFlush().replaceWith(user);
    }
    //endregion
}