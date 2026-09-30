package kurvcygnus.soulnotes.domain.summary;

import io.quarkus.test.junit.QuarkusTestProfile;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * <b>LLM 失联 Profile (每日总结 fail-open 测试专用)</b>
 * <p>与 {@code MockLlmProfile} 同款真库装配, 但 LangChain4j base-url 指向必然拒连的死端口
 * ({@code 127.0.0.1:1}), 模拟 AI 服务不可达. 不引用 {@code MockLlmServer} (无需启动 mock).</p>
 * @since 1.5.0
 */
public final class SummaryLlmOutageProfile implements QuarkusTestProfile
{
    @Override
    public Map<String, String> getConfigOverrides()
    {
        final var overrides = new HashMap<String, String>();
        //* 死端口: 连接拒绝在毫秒级暴露, 配 5s 超时兜底防极端环境下的长尾等待.
        overrides.put("quarkus.langchain4j.openai.base-url", "http://127.0.0.1:1/v1");
        overrides.put("quarkus.langchain4j.openai.api-key", "outage-key");
        overrides.put("quarkus.langchain4j.openai.timeout", "5s");
        overrides.put("quarkus.datasource.active", "true");
        overrides.put("quarkus.hibernate-orm.active", "true");
        overrides.put("quarkus.datasource.reactive.url", "postgresql://localhost:5432/soulnotes");
        overrides.put("quarkus.datasource.username", "kurv");
        //* 数据源口令经环境变量注入, 兜底为公开占位符: 本机口令曾随仓库泄露并已全历史去敏, 硬编码真值不允许回归.
        overrides.put("quarkus.datasource.password",
            Objects.requireNonNullElse(System.getenv("SOULNOTES_DB_PASSWORD"), "soulnotes_dev"));
        overrides.put("quarkus.http.test-port", "0");
        return Map.copyOf(overrides);
    }
}
