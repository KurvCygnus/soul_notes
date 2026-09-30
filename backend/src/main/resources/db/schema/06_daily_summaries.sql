-- * 这是创建表 "daily_summaries" 的初始化脚本 (每日 AI 情绪总结存储, homepage-v2 Task 7).
-- * 幂等: CREATE TABLE IF NOT EXISTS, 可重复执行. 依赖 01_users.sql 先行创建 users 表.
-- * (user_id, date) 唯一约束即查询索引: 按用户查今日/近程列表均为 user_id 前缀命中, 无需额外索引.
CREATE TABLE IF NOT EXISTS daily_summaries
(
    id         UUID      PRIMARY KEY,
    user_id    UUID      NOT NULL REFERENCES users(id),
    date       DATE      NOT NULL,
    content    TEXT      NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_daily_summaries_user_date UNIQUE (user_id, date)
);
