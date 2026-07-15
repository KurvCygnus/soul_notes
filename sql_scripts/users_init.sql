-- * 这是创建表 "users" 的初始化脚本.
-- * 请在数据库开启且没有该表的时候使用.
-- * 如果你的数据库是空白状态, 请去 [[init_schema.sql]] 初始化.
CREATE TABLE IF NOT EXISTS users
(
    id          UUID PRIMARY KEY,
    user_name   VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(32)  NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
