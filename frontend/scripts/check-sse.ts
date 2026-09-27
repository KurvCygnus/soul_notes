//* SSE 解析自检 (零依赖, 不参与打包):
//*     node --experimental-strip-types scripts/check-sse.ts
//* 需要 Node >= 22.6 (--experimental-strip-types). 覆盖真实后端行为: Multi<String> 的正文含换行时,
//* 服务端按 SSE 规范拆成多条 data: 行 —— 这里钉死"必须拼回同一段带 \n 的文本".

import assert from 'node:assert/strict'
import { sseEventData, takeSseEvents } from '../src/utils/sse.ts'

/** 照抄 chat.ts 的消费方式: 按到达顺序喂 chunk, 收集逐块吐出的文本 */
function drainWire(chunks: string[]): string[] {
  const out: string[] = []
  let buffer = ''
  for (const chunk of chunks) {
    buffer += chunk
    const { events, rest } = takeSseEvents(buffer)
    buffer = rest
    for (const event of events) {
      const data = sseEventData(event)
      if (data !== null) out.push(data)
    }
  }
  const tail = sseEventData(buffer)
  if (tail) out.push(tail)
  return out
}

//* 1. 一个事件的多条 data: 行 = 一段带 \n 的正文 (换行不能丢)
assert.deepEqual(drainWire(['data: 第一段\ndata: 第二段\n\n']), ['第一段\n第二段'])

//* 2. 分块到达 (含把一条 data: 行劈成两半) 结果不变
assert.deepEqual(drainWire(['data: 第一段\nda', 'ta: 第二段\n', '\n']), ['第一段\n第二段'])

//* 3. 相邻事件各成一块, 不许合并
assert.deepEqual(drainWire(['data: A\n\ndata: B\n\n']), ['A', 'B'])

//* 4. 心跳/注释行不产出 chunk
assert.deepEqual(drainWire([': ping\n\n', 'data: 正文\n\n']), ['正文'])

//* 5. CRLF 分隔同样认
assert.deepEqual(drainWire(['data: 甲\r\ndata: 乙\r\n\r\n']), ['甲\n乙'])

//* 6. 末尾事件缺空行也要吐出来 (chat.ts 的收尾分支)
assert.deepEqual(drainWire(['data: 最后一段']), ['最后一段'])

//* 7. 只剥一个规范空格, 后面的空格是正文
assert.deepEqual(drainWire(['data:  缩进\n\n']), [' 缩进'])

console.log('SSE 解析自检通过: 7/7')
