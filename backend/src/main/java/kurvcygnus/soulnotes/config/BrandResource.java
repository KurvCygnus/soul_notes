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
 * 品牌信息公开只读端点: 把 {@code app.brand-name} 与 {@code app.extensions-label} 配置暴露给前端
 * (浏览器标题/登录浮层/侧栏扩展节标题等消费点).
 * <p>评审整改: 品牌配置此前只被启动横幅消费, 前端完全硬编码产品名 — 部署方改配置对前端无效.
 * 本端点作为品牌域的事实源, 免认证 (与热线端点同级: 品牌名非敏感信息, 且需在登录前可用).</p>
 * @implNote 值为部署微调项, 读取即静态返回, 无缓存/无降级链需求 (配置缺失时 @ConfigProperty 默认值兜底).
 * @since 1.5.0
 */
@Path(ApiEndpointConstants.BRAND_BASE)
public final class BrandResource
{
    private final @NotNull String brandName;
    private final @NotNull String extensionsLabel;

    @Inject
    public BrandResource(
        @ConfigProperty(name = "app.brand-name", defaultValue = "Soul Notes") @NotNull String brandName,
        @ConfigProperty(name = "app.extensions-label", defaultValue = "扩展") @NotNull String extensionsLabel
    ) { this.brandName = brandName; this.extensionsLabel = extensionsLabel; }

    /**
     * 获取品牌信息.
     * @return {@link ApiResponse} 包裹的品牌域快照 (恒成功, 值即 {@code app.brand-name}/{@code app.extensions-label} 配置)
     */
    @GET @Produces(MediaType.APPLICATION_JSON)
    public @NotNull Uni<ApiResponse<BrandVo>> name()
    {
        return Uni.createFrom().item(ApiResponse.success(new BrandVo(brandName, extensionsLabel)));
    }

    /**
     * 品牌信息视图.
     * @param brandName 品牌名 (部署经 {@code SOULNOTES_BRAND_NAME} 注入)
     * @param extensionsLabel 扩展板块显示名 (部署经 {@code SOULNOTES_EXTENSIONS_LABEL} 注入, D7: 默认 "扩展", 全局生效)
     * @since 1.5.0
     */
    public record BrandVo(@NotNull String brandName, @NotNull String extensionsLabel) {}
}
