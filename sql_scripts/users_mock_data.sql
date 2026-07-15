-- * 这是表 "users" 的测试数据加载脚本.
-- * 请在数据库开启, 且需要简单测试时使用.
INSERT INTO users (id, user_name, password_hash, role, created_at) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'alice',   'e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a', 'STUDENT',   CURRENT_TIMESTAMP),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'bob',     'e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a', 'STUDENT',   CURRENT_TIMESTAMP),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'charlie', 'e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a', 'COUNSELOR', CURRENT_TIMESTAMP),
    ('d4e5f6a7-b8c9-0123-defa-234567890123', 'diana',   'e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a', 'ADMIN',     CURRENT_TIMESTAMP),
    ('e5f6a7b8-c9d0-1234-efab-345678901234', 'eve',     'e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a', 'STUDENT',   CURRENT_TIMESTAMP);
