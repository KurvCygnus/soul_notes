import { describe, it, expect } from 'vitest'
import { parseMarkdown, isSafeHref } from './md-parser'

describe('markdown 解析器移植验收', () => {
  it('CJK 全角标点邻接的强调 (CommonMark 死角)', () => {
    const [p] = parseMarkdown('，**重点**。') as any[]
    expect(p.kind).toBe('paragraph')
    expect(JSON.stringify(p)).toContain('"kind":"strong"')
    expect(JSON.stringify(p)).toContain('重点')
  })
  it('围栏代码块保留语言标注与原文', () => {
    const [c] = parseMarkdown('```ts\nconst a=1\n```') as any[]
    expect(c.kind).toBe('code'); expect(c.language).toBe('ts'); expect(c.text).toBe('const a=1\n')
  })
  it('GFM 表格带对齐', () => {
    const blocks = parseMarkdown('| a | b |\n| :-- | --: |\n| 1 | 2 |') as any[]
    expect(blocks[0].kind).toBe('table')
  })
  it('嵌套列表', () => {
    const blocks = parseMarkdown('- a\n  - a1\n- b') as any[]
    expect(blocks[0].kind).toBe('list'); expect(blocks[0].items.length).toBe(2)
  })
  it('isSafeHref 白名单', () => {
    expect(isSafeHref('https://a.b/c')).toBe(true)
    expect(isSafeHref('mailto:a@b.c')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
  })
})
