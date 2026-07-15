# Standards & Constraints

1. When Table is not created, ask developer before creating it.
2. When creating a table, you should create two files at `${project_root}/sql_scripts`:
    * The first one is named `${table_name}_init.sql`, writing table initialize scripts inside it, with such a header:
      ```sql
      -- * 这是创建表 "${table_name}" 的初始化脚本.
      -- * 请在数据库开启且没有该表的时候使用.
      -- * 如果你的数据库是空白状态, 请去 [[../init_schema.sql]] 初始化.
      ```
      Also, you must use `IF NOT EXISTS` to keep script idempotent.
      After created `${table_name}_init.sql`, you should add it to [init_schema.sql](../../init_schema.sql).
    * The second one is named `${table_name}_mock_data.sql`, writing 4 ~ 5 example data inside it, with such a header:
      ```sql
      -- * 这是表 "${table_name}" 的测试数据加载脚本.
      -- * 请在数据库开启, 且需要简单测试时使用.
      ```
3. **DO NOT perform any DDL changes in code, or ORM with commands like `DROP`, `ALTER`**.
    * Use `WHERE` when performing `UPDATE` or `DELETE`.
    * All core logic mustn't use physical deletion, soft deletion is acceptable.
4. All list entities must use page(`limit`/`page`), find all querying(`findAll()`) is not allowed.
5. Index should be created explicitly for all foreign key columns.
6. For `JSONB` fields(e.g. `analysis_result`), if some of its property is the condition of high frequency querying, you
   should create indexes for its expression, or advices developer to extract it as an independent field.
7. Timestamp-related fields must be maintained by SQL's default value(`DEFAULT CURRENT_TIMESTAMP`), or framework's AOP,
   filling manually with `new Date()` is not allowed.