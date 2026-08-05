-- * 这是数据库初始化脚本入口.
-- * 请在空白数据库上按顺序执行.
-- * 该文件引用 sql_scripts/ 目录下的具体表脚本.
-- * 添加新的表初始化脚本时, 请在此文件中按顺序引用.

-- 用户表
\i sql_scripts/users_init.sql

-- 情绪日记表
\i sql_scripts/mood_diaries_init.sql

-- AI 对话会话表
\i sql_scripts/ai_chat_sessions_init.sql
