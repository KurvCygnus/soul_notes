-- * 这是会话标题列的迁移脚本 (ai_chat_sessions 增列, 会话标题 Task).
-- * 幂等: ADD COLUMN IF NOT EXISTS, 可重复执行. 存量行 title 为 NULL (读取端以预览兜底, 不做回填).
ALTER TABLE ai_chat_sessions ADD COLUMN IF NOT EXISTS title TEXT;
