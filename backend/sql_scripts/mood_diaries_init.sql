-- * 这是创建表 "mood_diaries" 的初始化脚本.
-- * 请在数据库开启且没有该表的时候使用.
-- * 如果你的数据库是空白状态, 请去 [[init_schema.sql]] 初始化.
CREATE TABLE IF NOT EXISTS mood_diaries
(
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES users(id),
    content         TEXT,
    audio_url       VARCHAR(512),
    analysis_result JSONB,
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mood_diaries_user_id ON mood_diaries(user_id);
