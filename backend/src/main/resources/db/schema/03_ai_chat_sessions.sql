-- * 这是创建表 "ai_chat_sessions" 的初始化脚本 (程序化权威源, Spec §5: 由 sql_scripts/ai_chat_sessions_init.sql 迁移并加序号前缀保证执行次序).
-- * 幂等: CREATE TABLE IF NOT EXISTS, 可重复执行. 依赖 01_users.sql 先行创建 users 表.
-- * title/pinned_at/title_source 三列随建表自带 (Task 8 起新装环境不再依赖增量脚本):
--   title 是重命名端点与会话标题链的落库目标, 缺列会让标题链在全新库上整体静默降级;
--   存量库由 08_sessions_pin_rename.sql (title 另见 07_chat_session_titles.sql) 幂等补齐.
CREATE TABLE IF NOT EXISTS ai_chat_sessions
(
    id                UUID      PRIMARY KEY,
    user_id           UUID      NOT NULL REFERENCES users(id),
    messages          JSONB,
    warning_triggered BOOLEAN   NOT NULL DEFAULT FALSE,
    title             TEXT,
    pinned_at         TIMESTAMPTZ,
    title_source      VARCHAR   NOT NULL DEFAULT 'manual',
    updated_at        TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON ai_chat_sessions(user_id);
