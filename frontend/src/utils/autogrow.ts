//* 输入框自增高 (评审裁决: 对话框必须随文本量拉伸, 这是 UX 基本功).
//* 纯 DOM 操作工具: 先置 auto 触发浏览器按内容重排, 再取 scrollHeight 定高; 上限交由 CSS max-height 约束,
//* 溢出后由 overflow-y:auto 接管滚动. 独立成纯函数以便 jsdom 桩测 (jsdom 无布局, scrollHeight 恒 0).
export function growTextarea(el: { style: { height: string }; scrollHeight: number }): void
{
    if(el.scrollHeight <= 0)
    {
        el.style.height = ''  //* 无内容 (jsdom/空态): 交还 CSS min-height 决定, 避免写出 "0px".
        return
    }
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
}
