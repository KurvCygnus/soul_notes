-- * 这是表 "mood_diaries" 的测试数据加载脚本.
-- * 请在数据库开启, 且需要简单测试时使用.
INSERT INTO mood_diaries (user_id, content, analysis_result, created_at) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '今天天气真好, 心情很愉快!', '{"positive": 0.85, "negative": 0.05, "anxiety": 0.10}', CURRENT_TIMESTAMP),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '考试没考好, 有点沮丧。', '{"positive": 0.15, "negative": 0.70, "anxiety": 0.60}', CURRENT_TIMESTAMP),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', '和朋友一起出去了, 开心!', '{"positive": 0.90, "negative": 0.02, "anxiety": 0.05}', CURRENT_TIMESTAMP),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', '最近压力好大, 睡不着。', '{"positive": 0.10, "negative": 0.75, "anxiety": 0.90}', CURRENT_TIMESTAMP),
    ('e5f6a7b8-c9d0-1234-efab-345678901234', '平淡的一天, 没有什么特别的。', '{"positive": 0.40, "negative": 0.20, "anxiety": 0.25}', CURRENT_TIMESTAMP);
