//* 契约块守卫 (流式展示层) 纯状态机测试: 后端流式裁定 emit 保持原文 (拆流只在落库, [[ChatService#streamAiReply]]),
//* 而本前端流式分片与 vendored md 渲染器均以纯文本呈现 raw HTML — <!--soulnotes {...}--> 结构化载荷会在
//* 流式窗口内以原文暴露 (用户实测报告). 守卫与后端拆流正则 <!--+\s*soulnotes\s*(\{.*?})\s*--!?> 对齐:
//* 命中块 => 从展示流中剔除; 未决前缀 => 扣留待判; 流尾未闭合/未决 => flush 交还裁决.
import { describe, expect, it } from 'vitest'
import { createContractBlockFilter } from './contractBlockFilter'

//* 逐片推送并拼接可见输出: 模拟 SSE 分片序列的端到端视口.
function feed(tokens: ReadonlyArray<string>): { visible: string; flushed: string }
{
    const filter = createContractBlockFilter()
    let visible = ''
    for(const token of tokens)
        visible += filter.push(token)
    return { visible, flushed: filter.flush() }
}

describe('contractBlockFilter (流式契约块守卫)', () =>
{
    it('单片完整块: 块整体剔除, 正文保留', () =>
    {
        const { visible } = feed(['你并不孤单。<!--soulnotes {"tags":["焦虑"],"riskLevel":"NONE"}-->'])
        expect(visible).toBe('你并不孤单。')
    })

    it('块跨片拆开 (逐字流的最坏形态): 分片均被吸收, 正文不受损', () =>
    {
        const { visible } = feed(['你并不孤单。<!--soul', 'notes {"tags":["焦', '虑"],"riskLevel":"RED"}', '-->'])
        expect(visible).toBe('你并不孤单。')
    })

    it('开标记宽容变体 (与后端正则同规): 多横线/空白/感叹号收标记均识别', () =>
    {
        expect(feed(['A<!--- soulnotes {"a":1}-->B']).visible).toBe('AB')
        expect(feed(['A<!-- soulnotes {"a":1}--!>B']).visible).toBe('AB')
        expect(feed(['A<!------soulnotes{"a":1}-->B']).visible).toBe('AB')
    })

    it('收标记跨片拆开 ("--" + ">"): 下一片拼合后判收, 块整体吸收且块后正文透传', () =>
    {
        const { visible, flushed } = feed(['<!--soulnotes {"riskLevel":"RED"}--', '>别怕, 我在。'])
        expect(visible).toBe('别怕, 我在。')
        expect(flushed).toBe('')
    })

    it('收标记跨片拆开 ("--!" + ">"): 变体收标记拼合后判收', () =>
    {
        const { visible, flushed } = feed(['<!--soulnotes {"a":1}--!', '>今晚早点休息。'])
        expect(visible).toBe('今晚早点休息。')
        expect(flushed).toBe('')
    })

    it('收标记尾巴跨多片滚动的未决: 逐片拼合仍判收, 块无残字泄漏且块后正文不丢', () =>
    {
        const { visible, flushed } = feed(['<!--soulnotes {"a":1}', '--', '>好的', '明天见。'])
        expect(visible).toBe('好的明天见。')
        expect(flushed).toBe('')
    })

    it('块外正文以 "--"/"-" 收尾不受影响 (收标记扣留只发生在块内): 原样透传', () =>
    {
        expect(feed(['心情起伏--', '很大']).visible).toBe('心情起伏--很大')
        expect(feed(['心情低落-', '但被接住了']).visible).toBe('心情低落-但被接住了')
    })

    it('块后残余正文 (契约违反, 块在中段): 关闭后恢复透传', () =>
    {
        const { visible } = feed(['开头<!--soulnotes {"a":1}-->结尾'])
        expect(visible).toBe('开头结尾')
    })

    it('非契约注释不被吞: 普通 HTML 注释原样透传', () =>
    {
        const { visible } = feed(['示例 <!-- 普通 注释 --> 尾部'])
        expect(visible).toBe('示例 <!-- 普通 注释 --> 尾部')
    })

    it('未决前缀跨片: 不能排除是开标记时扣留, 判非后如数交还', () =>
    {
        const filter = createContractBlockFilter()
        expect(filter.push('回复 <!')).toBe('回复 ')  //* "<!" 可能长成 "<!--soulnotes", 扣留.
        expect(filter.push('-')).toBe('')  //* 仍可能: "<!-" -> "<!--"…
        expect(filter.push('- x')).toBe('<!-- x')  //* 判非 (缺第二横线即见空格): 扣留片如数交还.
        expect(filter.flush()).toBe('')
    })

    it('流尾 flush: 未决前缀原样交还 (正文以 <!-- 收尾是合法内容)', () =>
    {
        const { visible, flushed } = feed(['回答末尾 <!--'])
        expect(visible).toBe('回答末尾 ')
        expect(flushed).toBe('<!--')
    })

    it('流尾 flush: 未闭合契约块整块舍弃 (展示层宁缺勿滥, 历史以服务端拆流为权威)', () =>
    {
        const { visible, flushed } = feed(['正文<!--soulnotes {"a":1'])
        expect(visible).toBe('正文')
        expect(flushed).toBe('')
    })

    it('超长未闭合块触发放弃上限: 缓冲内容整体转可见 (兜底兜住 LLM 失控输出)', () =>
    {
        const giant = 'x'.repeat(3000)
        //* 拼接而非模板插值: vite:oxc 对模板串内 {"a":"${x}"} 形态存在误判 (node 可解析, oxc 报 PARSE_ERROR).
        const { visible } = feed(['正文<!--soulnotes {"a":"' + giant, '后续'])
        expect(visible.startsWith('正文<!--soulnotes')).toBe(true)  //* 放弃后块内容转为可见.
        expect(visible.endsWith('后续')).toBe(true)
    })

    it('连续多块 (LLM 在正文复述过早期块): 逐一剔除', () =>
    {
        const { visible } = feed(['A<!--soulnotes {}-->B<!--soulnotes {"riskLevel":"NONE"}-->C'])
        expect(visible).toBe('ABC')
    })
})
