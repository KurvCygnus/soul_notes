//* 聊天正文字号 (Task 4): localStorage `soul.chatFont` + CSS 令牌 --fs-chat 的唯一读写口.
//* 令牌挂 documentElement 内联 style, 消费端 .kv-chat-md 的 font-size: var(--fs-chat, inherit) (P1 预留钩子),
//* 注入即全链生效; 键名沿用 soul.* 前缀惯例, 设置页与启动恢复都必须经本模块读写, 不直写 localStorage.
export const CHAT_FONT_STORAGE_KEY = 'soul.chatFont'

export const MIN_CHAT_FONT = 12
export const MAX_CHAT_FONT = 20
export const DEFAULT_CHAT_FONT = 15

//* 读取并夹取: 缺失/非数值回落默认, 越界值夹回值域 — 旧版本/手改存储不至于把字号打到不可读.
export function getStoredChatFont(): number
{
    const stored = localStorage.getItem(CHAT_FONT_STORAGE_KEY)
    const parsed = stored == null ? Number.NaN : Number(stored)
    if(Number.isNaN(parsed))
        return DEFAULT_CHAT_FONT
    return Math.min(MAX_CHAT_FONT, Math.max(MIN_CHAT_FONT, Math.round(parsed)))
}

//* 应用唯一路径: 内联令牌与持久化双写恒同步 (设置页步进与 main.tsx 启动恢复共用, 重复写同值幂等).
export function applyChatFont(px: number): void
{
    document.documentElement.style.setProperty('--fs-chat', `${px}px`)
    localStorage.setItem(CHAT_FONT_STORAGE_KEY, String(px))
}
