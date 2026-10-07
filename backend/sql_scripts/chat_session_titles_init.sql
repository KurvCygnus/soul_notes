-- * 这是会话标题列的迁移脚本 (ai_chat_sessions 增列, 会话标题 Task).
-- * 请在数据库已存在 ai_chat_sessions 表的时候使用; 幂等, 可重复执行.
-- * 与程序化权威源 src/main/resources/db/schema/07_chat_session_titles.sql 保持一致.
-- * 存量行 title 为 NULL: 前端以消息预览兜底展示, 后端不做数据回填.
ALTER TABLE ai_chat_sessions ADD COLUMN IF NOT EXISTS title TEXT;
