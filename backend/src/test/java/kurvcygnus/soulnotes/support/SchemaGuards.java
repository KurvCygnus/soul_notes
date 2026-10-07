package kurvcygnus.soulnotes.support;

import io.smallrye.mutiny.Uni;
import org.hibernate.reactive.mutiny.Mutiny;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * <b>测试库增量 schema 守卫 (测试源公共工具)</b>
 * <p>真库集成测试的增量 DDL 幂等守卫: 增列类迁移不重建表, 开发库/CI 库可能尚未应用,
 * 由消费方测试在用例前执行权威源脚本 ({@code db/schema/*.sql}) 补齐 (DailySummaryGeneratorTest 先例收编).</p>
 * <p>不标注 JetBrains 注解: 该库为 compileOnly, 测试源集不可见 (先例: 全部测试类).</p>
 * @since 1.6.0
 */
public final class SchemaGuards
{
    private static final Duration AWAIT = Duration.ofSeconds(20);

    private SchemaGuards() { }

    /**
     * 确保 {@code ai_chat_sessions.title} 列存在 (会话标题迁移, 幂等).
     *
     * @param sessionFactory 测试用 Hibernate Reactive 会话工厂
     */
    public static void ensureChatSessionTitleColumn(Mutiny.SessionFactory sessionFactory)
    {
        applySchema(sessionFactory, "/db/schema/07_chat_session_titles.sql");
    }

    /**
     * 确保 {@code ai_chat_sessions.pinned_at/title_source} 列存在 (会话置顶/重命名迁移, 幂等).
     *
     * @param sessionFactory 测试用 Hibernate Reactive 会话工厂
     * @since 1.9.0
     */
    public static void ensureChatSessionPinRenameColumns(Mutiny.SessionFactory sessionFactory)
    {
        applySchema(sessionFactory, "/db/schema/08_sessions_pin_rename.sql");
    }

    /**
     * 确保 {@code user_chat_style} 表存在 (聊天风格五轴建表迁移, 幂等).
     *
     * @param sessionFactory 测试用 Hibernate Reactive 会话工厂
     * @since 2.1.0
     */
    public static void ensureChatStyleTable(Mutiny.SessionFactory sessionFactory)
    {
        applySchema(sessionFactory, "/db/schema/09_chat_style.sql");
    }

    //* 读取 classpath 下的迁移脚本并逐语句执行: 剥离 -- 注释行, 按分号切分 (DailySummaryGeneratorTest 同款).
    private static void applySchema(Mutiny.SessionFactory sessionFactory, String resource)
    {
        final var ddls = schemaStatements(resource);
        sessionFactory.withSession(session ->
        {
            Uni<Void> chain = Uni.createFrom().voidItem();
            for(final var ddl: ddls)
                chain = chain.chain(v -> session.createNativeQuery(ddl).executeUpdate().replaceWithVoid());
            return chain;
        }).await().atMost(AWAIT);
    }

    /**
     * 读取 classpath 下的建表脚本并拆为语句列表: 剥离 {@code --} 注释行, 按分号切分
     * (ClinicalPipelineTest 同款).
     */
    private static List<String> schemaStatements(String resource)
    {
        try(var stream = Objects.requireNonNull(
                SchemaGuards.class.getResourceAsStream(resource),
                "classpath 资源缺失: " + resource);
            var reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8)))
        {
            final var sql = reader.lines().
                filter(line -> !line.strip().startsWith("--")).
                reduce("", (left, right) -> left + "\n" + right);
            final var statements = new ArrayList<String>();
            for(final var part: sql.split(";"))
            {
                if(!part.isBlank())
                    statements.add(part.strip());
            }
            return statements;
        }
        catch(IOException e) { throw new IllegalStateException("schema 脚本读取失败: " + resource, e); }
    }
}
