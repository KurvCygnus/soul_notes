//* SSE 帧解析: 按事件聚合, 而不是逐行取。
//! 服务端把正文里的换行按 SSE 规范拆成了多条 `data:` 行 (一个事件 = 若干 data 行 + 一个空行),
//! 逐行当 chunk 拼接会把这些换行吃掉, 多段正文会被压成一行。

/** 取出缓冲中所有完整事件 (以空行结尾), 返回事件块数组与尚未收完的尾巴 */
export function takeSseEvents(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  let rest = buffer
  for (;;) {
    //* 事件分隔符是空行; \r?\n 兼容 CRLF 分隔.
    const sep = /\r?\n\r?\n/.exec(rest)
    if (!sep) break
    events.push(rest.slice(0, sep.index))
    rest = rest.slice(sep.index + sep[0].length)
  }
  return { events, rest }
}

/** 事件块 -> 文本块: 只认 data: 行, 按规范用 \n 连接; 无 data 行 (注释/心跳) 返回 null */
export function sseEventData(event: string): string | null {
  const lines: string[] = []
  for (const line of event.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    //! 只剥 "data:" 后的一个规范空格, 不能 trim: 行首空格是正文的一部分 (否则英文粘词).
    lines.push(line.slice(5).replace(/^ /, ''))
  }
  return lines.length > 0 ? lines.join('\n') : null
}
