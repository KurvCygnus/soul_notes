package kurvcygnus.soulnotes.config;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

//* 品牌端点结构断言 (纯 JUnit, 反射式; 沿用 ChatResourceTest 的结构测试惯例).
//* 无 @QuarkusTest 契约用例: 端点为无状态配置读取 (恒 200), 契约语义已由结构 + 配置键钉死.
class BrandResourceTest
{
    //* 路径常量即前端契约: 前端 api/brand.ts 以 /api/v1/brand 免认证直取.
    @Test void class_ShouldExposeBrandPath()
    {
        final var path = BrandResource.class.getAnnotation(Path.class);
        assertNotNull(path, "BrandResource 必须挂 @Path (前端契约: /api/v1/brand)");
        assertEquals("/api/v1/brand", path.value());
    }

    @Test void name_ShouldBeGetEndpoint()
    {
        final Method name;
        try { name = BrandResource.class.getMethod("name"); }
        catch(NoSuchMethodException e) { throw new AssertionError("缺少 name() 端点方法", e); }
        assertNotNull(name.getAnnotation(GET.class), "name() 必须为 GET");
    }

    //* 配置键即需求锚: 品牌值必须来自 app.brand-name (SOULNOTES_BRAND_NAME 注入链), 不得硬编码.
    @Test void constructor_ShouldReadBrandNameConfig()
    {
        final Constructor<?> ctor;
        try { ctor = BrandResource.class.getDeclaredConstructor(String.class, String.class); }
        catch(NoSuchMethodException e) { throw new AssertionError("缺少 (String, String) 注入构造器", e); }
        final var param = ctor.getParameters()[0];
        final var cfg = param.getAnnotation(ConfigProperty.class);
        assertNotNull(cfg, "brandName 参数必须经 @ConfigProperty 注入");
        assertEquals("app.brand-name", cfg.name());
        assertEquals("Soul Notes", cfg.defaultValue());
    }

    //* 契约形状锚 (D7): BrandVo 必须双分量下发 — 前端 BrandInfo 逐字段转写, 缺分量即前端字段失源.
    @Test void brandVo_ShouldCarryExtensionsLabelComponent()
    {
        final RecordComponent[] components = BrandResource.BrandVo.class.getRecordComponents();
        assertNotNull(components, "BrandVo 必须为 record (前端契约形状)");
        final var names = Arrays.stream(components).map(RecordComponent::getName).toList();
        assertEquals(List.of("brandName", "extensionsLabel"), names);
    }

    //* 配置键即需求锚 (D7): 扩展板块显示名必须来自 app.extensions-label (SOULNOTES_EXTENSIONS_LABEL 注入链), 默认 "扩展".
    @Test void constructor_ShouldReadExtensionsLabelConfig()
    {
        final Constructor<?> ctor;
        try { ctor = BrandResource.class.getDeclaredConstructor(String.class, String.class); }
        catch(NoSuchMethodException e) { throw new AssertionError("缺少 (String, String) 注入构造器", e); }
        final var cfg = ctor.getParameters()[1].getAnnotation(ConfigProperty.class);
        assertNotNull(cfg, "extensionsLabel 参数必须经 @ConfigProperty 注入");
        assertEquals("app.extensions-label", cfg.name());
        assertEquals("扩展", cfg.defaultValue());
    }
}
