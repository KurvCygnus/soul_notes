//* 消息时间分组 (纯函数): 按本地日分桶, 标签 今天/昨天/M-D; 无时间条目并入当前桶不另分隔.
//* 供 [[ChatStream]] 渲染日期分隔条, 分组结果随消息数组纯计算, 无副作用.
import type { ChatHistoryMessage, ChatMessage, ChatRole } from '../types'

//* 前端统一展示形态: 流式乐观消息无时间 (ts 为 null), 历史/降级消息携带服务端时间戳.
export type IDisplayMessage = {
    role: ChatRole
    content: string
    ts: string | null
}

export type IMessageGroup = {
    label: string
    items: IDisplayMessage[]
}

//* 本地日键: 年-月-日 (本地时区). 用日期分量而非毫秒差, 规避夏令时/跨月导致的"昨天"差一陷阱.
function dayKey(d: Date): string
{
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

//* 分桶标签: [[now]] 注入便于测试; 非今昨以 M-D 呈现 (月份/日期均不补零, 与产品示例 9-28 一致).
function labelFor(d: Date, now: Date): string
{
    if(dayKey(d) === dayKey(now))
        return '今天'
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)  //* setDate 自动处理月/年边界 (8-31 -> 9-1 的昨天) 与夏令时.
    if(dayKey(d) === dayKey(yesterday))
        return '昨天'
    return `${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 相对时间展示 (Task 14): 刚刚 (±60s, 含轻微时钟偏移) → N 分钟前 (<60m) → H:mm (同日) → 昨天 → M-D (更早).
 * 纯函数, [[now]] 注入便于测试 (与 [[groupMessages]] 同款模式); 分日判定复用日期分量法, 规避毫秒差在
 * 夏令时/跨月下的"昨天"差一陷阱. 小时 H 不补零, 分钟 mm 补零 (如 9:05), 与分桶标签的 M-D 风格一致.
 */
export function formatRelative(iso: string, now: Date = new Date()): string
{
    const d = new Date(iso)
    if(Number.isNaN(d.getTime()))
        return ''  //! 非法时间串返回空串而非抛错: 渲染层可直接条件跳过, 与 [[groupMessages]] 的容错口径一致.
    const diffMs = now.getTime() - d.getTime()
    if(diffMs > -60_000 && diffMs < 60_000)
        return '刚刚'  //* 服务端时钟轻微超前的瞬间也应是"刚刚": 下界放宽到 -60s, 不出现"刚刚之前".
    if(diffMs >= 60_000 && diffMs < 3_600_000)
        return `${Math.floor(diffMs / 60_000)} 分钟前`
    if(dayKey(d) === dayKey(now))
        return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)  //* setDate 自动处理月/年边界与夏令时 (同 [[labelFor]]).
    if(dayKey(d) === dayKey(yesterday))
        return '昨天'
    return `${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 消息分桶: 时间取 `timestamp ?? ts` (流式 [[ChatMessage]] 与历史 [[ChatHistoryMessage]] 双形态归一).
 * 无时间或时间非法的条目并入"当前"(最后一个)桶且不另起新桶; 若尚无任何桶 (如新对话首条乐观消息),
 * 开一个无标签桶 (label '') 承接 — 渲染层以空标签跳过日期分隔条, 保证消息不丢.
 */
export function groupMessages(msgs: readonly (ChatMessage | ChatHistoryMessage)[], now: Date = new Date()): IMessageGroup[]
{
    const groups: IMessageGroup[] = []
    let curKey: string | null = null
    for(const m of msgs)
    {
        //* 双形态归一: ChatMessage.timestamp / ChatHistoryMessage.ts 各持一键; 'timestamp' in m 无法收窄
        //* 可选键的假分支 (ChatMessage 缺键时仍可能是 ChatMessage), 故按结构混合读取, 缺键缺值统一视作无时间.
        const rec = m as Partial<ChatMessage & ChatHistoryMessage>
        const raw = rec.timestamp ?? rec.ts ?? null
        const parsed = raw == null ? null : new Date(raw)
        const dated = parsed != null && !Number.isNaN(parsed.getTime())
        if(dated && parsed != null)
        {
            const key = dayKey(parsed)
            if(key !== curKey)
            {
                groups.push({ label: labelFor(parsed, now), items: [] })
                curKey = key
            }
        }
        else if(groups.length === 0)
        {
            //* 首条即无时间: 开隐式桶承接; curKey 保持 null, 后续任何日期条目都自然另起桶.
            groups.push({ label: '', items: [] })
        }
        const bucket = groups[groups.length - 1]
        bucket.items.push({ role: m.role, content: m.content, ts: dated ? (raw ?? null) : null })
    }
    return groups
}
