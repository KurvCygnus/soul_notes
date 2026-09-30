package kurvcygnus.soulnotes.config;

import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import kurvcygnus.soulnotes.dto.ApiResponse;
import kurvcygnus.soulnotes.utils.constants.ApiEndpointConstants;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jetbrains.annotations.NotNull;

/**
 * 品牌信息公开只读端点: 把 {@code app.brand-name} 配置暴露给前端 (浏览器标题/登录浮层等消费点).
 * <p>评审整改: 品牌配置此前只被启动横幅消费, 前端完全硬编码产品名 — 部署方改配置对前端无效.
 * 本端点作为品牌的事实源, 免认证 (与热线端点同级: 品牌名非敏感信息, 且需在登录前可用).</p>
 * @implNote 值为部署微调项, 读取即静态返回, 无缓存/无降级链需求 (配置缺失时 @ConfigProperty 默认值兜底).
 * @since 1.5.0
 */
@Path(ApiEndpointConstants.BRAND_BASE)
public final class BrandResource
{
    private final @NotNull String brandName;

    @Inject
    public BrandResource(
        @ConfigProperty(name = "app.brand-name", defaultValue = "Soul Notes") @NotNull String brandName
    ) { this.brandName = brandName; }

    /**
     * 获取品牌名.
     * @return {@link ApiResponse} 包裹的品牌名 (恒成功, 值即 {@code app.brand-name} 配置)
     */
    @GET @Produces(MediaType.APPLICATION_JSON)
    public @NotNull Uni<ApiResponse<BrandVo>> name()
    {
        return Uni.createFrom().item(ApiResponse.success(new BrandVo(brandName)));
    }

    /**
     * 品牌信息视图.
     * @param brandName 品牌名 (部署经 {@code SOULNOTES_BRAND_NAME} 注入)
     * @since 1.5.0
     */
    public record BrandVo(@NotNull String brandName) {}
}
