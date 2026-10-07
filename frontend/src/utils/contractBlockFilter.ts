//* 流式契约块守卫 (展示层): 后端流式路径裁定 emit 保持原文 (拆流 [[ClinicalOutputSplitter]] 只作用于落库文本,
//* 缓冲拆流会破坏逐字渲染且流中断时丢内容 — [[ChatService#streamAiReply]] 注释), 而 <!--soulnotes {...}-->
//* 结构化契约块会随分片原样到达前端; 本前端流式分片 (ChatBubble chunk span) 与 vendored md 渲染器
//* (raw HTML 非文法, textContent 转义呈现) 都会把块以原文显示 — 用户实测报告的结构化数据暴露即此.
//* 守卫与后端拆流正则 <!--+\s*soulnotes\s*(\{.*?})\s*--!?> 同规: 开标记命中即吸收块内容直至收标记;
//* 分片任意拆开时对"可能是开标记前缀"的尾巴扣留待判 (未决), 判非后如数交还, 保证逐字渲染不吞正文;
//* 块内收标记同理扣留 (未命中完整收标记时扣尾部至多 3 字符拼合再判) — 漏判会让块永不闭合.
//! 展示层宁缺勿滥: 流尾仍未闭合的块整块舍弃 (历史文本以服务端拆流为权威, 重拉历史后自愈);
//! 未决尾巴流尾原样交还 — 正文以 "<!--" 收尾是合法内容, 不得吞掉.
//region 状态机

//* 开标记骨架: "<!--" + 额外横线* + 空白* + "soulnotes" (大小写敏感, 与后端正则 <!--+\s*soulnotes 同规).
const MARKER_HEAD = '<!--'
const MARKER_BODY = 'soulnotes'

//* 未决前缀上限: 开标记探测只允许横线/空白/标记字面, 超长仍不能判定即判非透传 (横线/空白游程理论无界).
const PENDING_CAP = 64

//* 收标记未决扣留上限: '-->' 3 字符 / '--!>' 4 字符, 任意切点至多把 3 个字符藏进片尾 —
//* 块内未命中完整收标记时扣留尾部至多 3 字符挂 pending, 下一片拼合后再判 (与开标记扣留同法).
const CLOSE_PENDING_CAP = 3

//* 未闭合块缓冲上限: 超过即判定 LLM 失控输出 (契约块从不超此量级), 缓冲整体转可见 —
//! 防止守卫退化成黑洞吞掉后续正文或后端兜底回复 (onError 的 FALLBACK_REPLY 可能恰在块未闭合时到达).
const BLOCK_CAP = 2048

//* matchOpen 的三态: 拒绝 (判非) / 未决 (可能是前缀, 需更多文本) / 其余为开标记结束的绝对下标.
const OPEN_REJECT = -1
const OPEN_UNDECIDED = 0

//* scanOpen 的结果形态: plain = 全文无开标记; held = 末尾有未决前缀; open = 命中开标记
//* (marker 携带开标记原文 — 放弃上限转可见时需原样交还, 不得凭空蒸发).
type ScanOpenResult =
    | { kind: 'plain'; out: string }
    | { kind: 'held'; out: string; held: string }
    | { kind: 'open'; out: string; marker: string; after: string }

//* Java \s 同集空白判定 (后端正则 \s = [ \t\n\x0B\f\r], 前端须与其同口径).
function isContractSpace(ch: string): boolean
{
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u000B' || ch === '\f'
}

/**
 * 从 start 处尝试匹配开标记 "<!--" + -* + \s* + "soulnotes".
 * @returns OPEN_REJECT (判非) / OPEN_UNDECIDED (文本耗尽, 可能仍是前缀) / 开标记结束的绝对下标
 */
function matchOpen(text: string, start: number): number
{
    let k = start
    for(let h = 0; h < MARKER_HEAD.length; h++)
    {
        if(k >= text.length)
            return OPEN_UNDECIDED  //* 骨架未比对完: 文本耗尽, 尾巴仍是候选前缀.
        if(text[k] !== MARKER_HEAD[h])
            return OPEN_REJECT
        k++
    }
    while(k < text.length && text[k] === '-')
        k++  //* 额外横线游程 (<!--- 容忍变体).
    if(k >= text.length)
        return OPEN_UNDECIDED
    while(k < text.length && isContractSpace(text[k]))
        k++  //* 空白游程.
    if(k >= text.length)
        return OPEN_UNDECIDED
    for(let b = 0; b < MARKER_BODY.length; b++)
    {
        if(k >= text.length)
            return OPEN_UNDECIDED
        if(text[k] !== MARKER_BODY[b])
            return OPEN_REJECT
        k++
    }
    return k
}

/**
 * 逐字扫描文本: 剔除/吸收契约块, 返回首个开标记命中的位置或全文的可见拆分.
 * 拒绝的开标记候选只透传 "<" 一个字符后从下一字符续扫 (<' 后不可能再长出开标记起点).
 */
function scanOpen(text: string): ScanOpenResult
{
    let out = ''
    let i = 0
    for(;;)
    {
        const lt = text.indexOf('<', i)
        if(lt < 0)
            return { kind: 'plain', out: out + text.slice(i) }
        out += text.slice(i, lt)
        const m = matchOpen(text, lt)
        if(m === OPEN_REJECT)
        {
            out += '<'
            i = lt + 1
            continue
        }
        if(m === OPEN_UNDECIDED)
        {
            const held = text.slice(lt)
            if(held.length > PENDING_CAP)
            {
                out += '<'  //* 探测游程超界: 横线/空白不可能再组成契约标记, 判非透传.
                i = lt + 1
                continue
            }
            return { kind: 'held', out, held }
        }
        return { kind: 'open', out, marker: text.slice(lt, m), after: text.slice(m) }
    }
}

//* 定位收标记 (--!?> 同规: "-->" 与 "--!>" 取先到者; 两者互不包含, indexOf 取小即可).
function findClose(text: string): { index: number; end: number } | null
{
    const plain = text.indexOf('-->')
    const bang = text.indexOf('--!>')
    if(plain < 0 && bang < 0)
        return null
    if(plain < 0)
        return { index: bang, end: bang + 4 }
    if(bang < 0)
        return { index: plain, end: plain + 3 }
    return plain < bang ? { index: plain, end: plain + 3 } : { index: bang, end: bang + 4 }
}

export interface IContractBlockFilter
{
    //* 送入一个流式分片, 返回其中可安全显示的增量 (可能为空串 — 整片被块吸收).
    push(token: string): string
    //* 流尾裁决: 未决前缀原样交还 (合法正文); 未闭合块整块舍弃 (展示层宁缺勿滥).
    flush(): string
}

/**
 * 创建单次发送的守卫实例 (状态随流存续: 每轮 doSend 新建, 不跨发送复用).
 */
export function createContractBlockFilter(): IContractBlockFilter
{
    //* 未决扣留: 块外存疑似开标记前缀的尾巴 (判非后如数交还), 块内存疑似收标记的尾部
    //* (至多 CLOSE_PENDING_CAP 字符, 属块内容本就该吸收) — push 时先拼合再判定, 任意切点不漏判标记.
    let pending = ''
    //* 块内抑制态: 命中开标记后到收标记之间的内容全部吸收; blockBuf 服务于放弃上限.
    let inBlock = false
    let blockBuf = ''

    function consume(text: string): string
    {
        let out = ''
        let rest = text
        for(;;)
        {
            if(inBlock)
            {
                const close = findClose(rest)
                if(close == null)
                {
                    //* 收标记同样会被分片切断 ('--'+'>' / '--!'+'>'): 未命中完整收标记时扣留尾部至多
                    //* 3 字符挂 pending, 下一片拼合后再判 — 漏判会让块永不闭合 (块后正文被整块吞掉,
                    //* 撑爆放弃上限时连带结构化载荷一起外显). 扣留只发生在块内: 块外正文以 '--' 收尾
                    //* 由 scanOpen 直接透传, 行为不变.
                    const hold = rest.slice(-CLOSE_PENDING_CAP)
                    blockBuf += rest.slice(0, rest.length - hold.length)
                    pending = hold
                    if(blockBuf.length > BLOCK_CAP)
                    {
                        //* 放弃上限兜底: 失控的未闭合输出整体转可见 (连同未决尾巴, 不凭空蒸发),
                        //* 守卫不吞正文/兜底回复 (onError 的 FALLBACK_REPLY 可能恰在块未闭合时到达).
                        out += blockBuf + pending
                        pending = ''
                        blockBuf = ''
                        inBlock = false
                    }
                    return out
                }
                rest = rest.slice(close.end)
                blockBuf = ''
                inBlock = false
                continue  //* 收标记后的余文按普通文本续扫 (可能紧跟下一个块).
            }
            const scan = scanOpen(rest)
            out += scan.out
            if(scan.kind === 'plain')
                return out
            if(scan.kind === 'held')
            {
                pending = scan.held
                return out
            }
            inBlock = true
            blockBuf = scan.marker  //* 块缓冲从开标记起留存: 放弃上限转可见时内容原样交还, 无凭空蒸发.
            rest = scan.after  //* 开标记命中: 余文进入块内抑制, 循环顶处理.
        }
    }

    return {
        push(token: string): string
        {
            //* 未决扣留与新分片拼合后统一判定 (开标记可能横跨任意多片).
            const text = pending + token
            pending = ''
            return consume(text)
        },
        flush(): string
        {
            if(inBlock)
                return ''  //* 契约块未闭合: 整块舍弃 (历史以服务端拆流为权威).
            const held = pending
            pending = ''
            return held
        },
    }
}

//endregion
