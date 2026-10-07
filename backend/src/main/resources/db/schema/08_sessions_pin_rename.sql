-- * 这是会话置顶与手动重命名列的迁移脚本 (ai_chat_sessions 增列, 会话置顶/重命名 Task).
-- * 幂等: ADD COLUMN IF NOT EXISTS, 可重复执行. 新装环境由 03_ai_chat_sessions.sql 建表自带, 本脚本仅补存量库.
-- * 存量行 title_source 落列默认 'manual': 存量会话先于自动化标题链存在, 一律视为"非托管" —
--   自动标题链 (首轮生成 + 启动回填) 对 manual 行永久豁免 (SessionTitleGenerator/SessionTitleBackfiller 双闸门);
--   应用新建会话由实体字段初始化为 'auto' (托管), 标题链照常工作, 不受本默认影响.
ALTER TABLE ai_chat_sessions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE ai_chat_sessions ADD COLUMN IF NOT EXISTS title_source VARCHAR NOT NULL DEFAULT 'manual';
