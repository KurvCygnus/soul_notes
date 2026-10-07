-- * 这是创建表 "user_chat_style" 的建表脚本 (用户聊天风格五轴, P2 Task 1: chat-style 表/端点/提示词注入).
-- * 幂等: CREATE TABLE IF NOT EXISTS, 可重复执行.
CREATE TABLE IF NOT EXISTS user_chat_style
(
    user_id     UUID PRIMARY KEY REFERENCES users(id),
    style       VARCHAR     NOT NULL DEFAULT 'default',
    warmth      VARCHAR     NOT NULL DEFAULT 'default',
    enthusiasm  VARCHAR     NOT NULL DEFAULT 'default',
    headings    VARCHAR     NOT NULL DEFAULT 'default',
    emoji       VARCHAR     NOT NULL DEFAULT 'default',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
