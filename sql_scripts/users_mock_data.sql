-- * 这是表 "users" 的测试数据加载脚本.
-- * 请在数据库开启, 且需要简单测试时使用.
-- * 演示账号统一密码: Soulnotes123! (PBKDF2 格式, 满足密码复杂度校验).
-- * 哈希为固定盐的 PBKDF2WithHmacSHA256 (210000 轮, 256bit), 仅用于演示, 生产账号使用随机盐.
INSERT INTO users (id, user_name, password_hash, role, created_at) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'alice',   'pbkdf2$210000$0102030405060708090a0b0c0d0e0f10$2f809d2d789f18c68a97f5225243d2a5efbdc59744ec4ebdcc18846ad0d97570', 'STUDENT',   CURRENT_TIMESTAMP),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'bob',     'pbkdf2$210000$0102030405060708090a0b0c0d0e0f10$2f809d2d789f18c68a97f5225243d2a5efbdc59744ec4ebdcc18846ad0d97570', 'STUDENT',   CURRENT_TIMESTAMP),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'charlie', 'pbkdf2$210000$0102030405060708090a0b0c0d0e0f10$2f809d2d789f18c68a97f5225243d2a5efbdc59744ec4ebdcc18846ad0d97570', 'COUNSELOR', CURRENT_TIMESTAMP),
    ('d4e5f6a7-b8c9-0123-defa-234567890123', 'diana',   'pbkdf2$210000$0102030405060708090a0b0c0d0e0f10$2f809d2d789f18c68a97f5225243d2a5efbdc59744ec4ebdcc18846ad0d97570', 'ADMIN',     CURRENT_TIMESTAMP),
    ('e5f6a7b8-c9d0-1234-efab-345678901234', 'eve',     'pbkdf2$210000$0102030405060708090a0b0c0d0e0f10$2f809d2d789f18c68a97f5225243d2a5efbdc59744ec4ebdcc18846ad0d97570', 'STUDENT',   CURRENT_TIMESTAMP);
