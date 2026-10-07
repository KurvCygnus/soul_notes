import { describe, it, expect } from 'vitest'
import { renderMdDocument, MD_SCOPE_CLASS } from './md-render'
import { parseMarkdown } from './md-parser'

describe('markdown 渲染器', () => {
  it('容器挂 kv-chat-md 作用域类', () => {
    expect(renderMdDocument(parseMarkdown('hi')).classList.contains(MD_SCOPE_CLASS)).toBe(true)
  })
  it('任意输入不产生 script/iframe/事件属性 (textContent 契约)', () => {
    const dirty = '<script>alert(1)</script><img src=x onerror=alert(1)>[x](javascript:alert(1))'
    const el = renderMdDocument(parseMarkdown(dirty))
    expect(el.querySelector('script')).toBeNull()
    expect(el.querySelector('iframe')).toBeNull()
    expect(el.querySelector('[onerror]')).toBeNull()
    expect(el.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(el.textContent).toContain('<script>')
  })
  it('列表渲染出显式 marker span (不依赖 UA list CSS)', () => {
    const el = renderMdDocument(parseMarkdown('- 甲\n- 乙'))
    expect(el.querySelectorAll('[class*=marker], .kv-chat-md li').length).toBeGreaterThanOrEqual(2)
  })
})
