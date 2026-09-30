//* autogrow 纯函数测试: jsdom 无布局, 以桩元素验证定高逻辑 (评审整改: 输入框必须随文本拉伸).
import { describe, expect, it } from 'vitest'
import { growTextarea } from './autogrow'

describe('growTextarea (自增高)', () =>
{
    it('有内容: 先 auto 再定高为 scrollHeight', () =>
    {
        const el = { style: { height: '' } as CSSStyleDeclaration, scrollHeight: 120 }
        growTextarea(el)
        expect(el.style.height).toBe('120px')
    })

    it('无内容 (scrollHeight 0): 交还 CSS, 不写出 0px', () =>
    {
        const el = { style: { height: '80px' } as CSSStyleDeclaration, scrollHeight: 0 }
        growTextarea(el)
        expect(el.style.height).toBe('')
    })
})
