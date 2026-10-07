import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

const collect = () => { const out: string[] = []; return { out, parser: createSseParser(d => out.push(d)) } }

describe('sse parser', () =>
{
  it('单事件单 data', () => { const c = collect(); c.parser.push('data: 你好\n\n'); expect(c.out).toEqual(['你好']) })
  it('一块多事件', () => { const c = collect(); c.parser.push('data: a\n\ndata: b\n\n'); expect(c.out).toEqual(['a', 'b']) })
  it('跨 chunk 半截事件留缓冲', () =>
  {
    const c = collect(); c.parser.push('data: 你'); c.parser.push('好\n\n')
    expect(c.out).toEqual(['你好'])
  })
  it('CRLF 兼容', () => { const c = collect(); c.parser.push('data: a\r\n\r\n'); expect(c.out).toEqual(['a']) })
  it('同事件多 data 行以换行连接', () => { const c = collect(); c.parser.push('data: l1\ndata: l2\n\n'); expect(c.out).toEqual(['l1\nl2']) })
  it('非 data 行与注释忽略', () => { const c = collect(); c.parser.push(': ping\nevent: x\ndata: v\n\n'); expect(c.out).toEqual(['v']) })
  it('end() 冲刷残留缓冲', () => { const c = collect(); c.parser.push('data: tail\n\nxx'); c.parser.end(); expect(c.out).toEqual(['tail']) })
})
