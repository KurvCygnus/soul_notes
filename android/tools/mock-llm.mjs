#!/usr/bin/env node
//* 本地 Mock LLM (零 token 测试用): OpenAI 兼容 /chat/completions, 路由契约照抄后端 MockLlmServer:
//* 候选追问锚点 → JSON 数组 / 会话标题锚点 → 标题文本 / SOULNOTES-RED-PROBE → RED 预警 JSON /
//* 无工具其余 → NONE 预警 JSON / 带 tools 的对话请求 → 共情回复 (stream=true 时 SSE 打字机分片)。
//* R4 演示质量升级 (2026-10-07): 共情回复多套按消息内容选择 (温暖倾听者语气, 拟真 Markdown 排版);
//* 会话标题/候选追问池化轮换 (修复侧栏截图同名标题 x10 的假感); 课表类请求下发真实 tool_call SSE —
//* 后端 langchain4j 执行 query_timetable 后二次请求, 汇总回复基于工具真实出参, 演示链路全程无注入。
//* 锚点路由机制 (追问/标题/RED 探针/契约块) 与请求录制行为一律保持不变 (探针与组装断言依赖)。
import http from 'node:http'
import { writeFileSync, appendFileSync } from 'node:fs'

const PORT = Number(process.env.MOCK_LLM_PORT) || 8123
const RED_KEYWORD = 'SOULNOTES-RED-PROBE'
const TITLE_ANCHOR = '会话标题'
const FOLLOWUP_ANCHOR = '候选追问'
const TIMETABLE_TOOL = 'query_timetable'
const RED_DETECTION_JSON = '{"warningLevel":"RED","reason":"mock 检测到自伤风险信号","suggestedAction":"立即展示危机热线"}'
const NONE_DETECTION_JSON = '{"warningLevel":"NONE","reason":"","suggestedAction":""}'

//* 会话标题池: 轮换下发, 避免多会话截图出现同名标题 (R3 素材审计: "备考夜谈" x10 判定假感)。
const TITLE_POOL = ['备考夜谈', '深夜睡不着', '图书馆的一天', '周一低气压', '想家的时候', '社团招新之后', '雨天的碎碎念', '考完的那晚']
//* 候选追问池: 用户口吻的续聊建议, 轮换下发。
const FOLLOWUP_POOL = [
  ['如果试了之后还是有困惑, 我还能回来继续聊吗?', '想听听类似情况的其他视角, 可以吗?', '现在就开始做的话, 第一步做什么比较好?'],
  ['今天怎么就这么累啊, 有什么办法能缓一缓吗?', '这种感觉持续挺久了, 正常吗?', '先不聊这个了, 说点轻松的行吗?'],
]
//* 共情回复组: 按最后一条用户消息的关键词语义选择 (温暖倾听者, 非评判, 无医疗化标签);
//* 命中多组取最前; 全部未命中则在通用组间轮换。结构为拟真 Markdown (段落/加粗/列表/引用/分隔线, 3~6 行)。
const EMPATHY_REPLIES = [
  {
    keys: ['累', '疲惫', '撑不住', '压力大', '连轴', '好忙', '忙'],
    text: '听起来这一天真的把你消耗得差不多了, **从早到晚连轴转, 换谁都会累的**。\n\n> 累的时候, 允许自己先歇一会儿, 不用急着"振作"。\n\n今晚打算给自己留点喘口气的时间吗? 想聊的时候我都在。',
  },
  {
    keys: ['睡不着', '失眠', '熬夜', '凌晨', '深夜', '睡不着觉', '入睡'],
    text: '深夜睡不着的时候, 脑子里的声音会被放得特别大, **这是夜晚太长, 不是你太脆弱**。\n\n先不急着逼自己入睡, 陪自己安静地待一会儿就好。\n\n想跟我讲讲最近在心里盘旋的事吗? 说出来, 也许会轻一点。',
  },
  {
    keys: ['考试', '复习', '挂科', '成绩', '绩点', '刷题', '作业'],
    text: '复习到这个程度还觉得自己不够好, **恰恰说明你真的很在意这件事**。\n\n- 不如先合上书, 给自己十分钟彻底放空\n- 或者在这儿把心里乱糟糟的东西倒一倒\n\n进度快慢都不代表你不行, 一步一步来就好。',
  },
  {
    keys: ['难过', '孤独', '委屈', '想哭', '烦', '难受', '低落', '崩溃'],
    text: '谢谢你愿意把这些说出来, **能开口, 本身就已经很勇敢了**。\n\n难过的时候不必急着好起来, 让情绪自然地待一会儿, 我陪着你。\n\n想说什么都可以, 想安静一会儿也完全可以。',
  },
]
const GENERAL_REPLIES = [
  '我在这里, 慢慢说。**不管此刻是哪种心情, 它都值得被好好听见。**\n\n今天发生了什么, 让你有这样的感受?\n\n不用组织语言, 想到哪儿说到哪儿就好。',
  '嗯, 我在听。**情绪没有对错, 它来了, 就有它的原因。**\n\n---\n\n如果愿意, 可以从最近的一件小事说起, 我很想听听你的视角。',
]

let titleCursor = 0
let followupCursor = 0
let generalCursor = 0

const readBody = req => new Promise(ok => { let b = ''; req.on('data', c => b += c); req.on('end', () => ok(b)) })

//* 取请求体里最后一条用户消息文本 (按内容选择回复组的依据; 解析失败回退空串走通用轮换)。
const lastUserText = j =>
  Array.isArray(j?.messages)
    ? (j.messages.filter(m => m?.role === 'user').pop()?.content ?? '')
    : ''

//* 关键词匹配只看"用户最新消息"分段: 共情 Agent 的 user turn 会把多轮对话历史整块拼进同一条消息,
//* 直接对全文匹配会被历史轮的关键词污染 (同一会话永远命中同一组回复, 演示里两轮回复一模一样)。
const pickReply = raw =>
  EMPATHY_REPLIES.find(set => set.keys.some(k => String(raw).split(/用户最新消息[:：]?/).pop().includes(k)))?.text
    ?? GENERAL_REPLIES[generalCursor++ % GENERAL_REPLIES.length]

//* SSE 打字机分片: 按行切分, 长行再按 ~12 字符细分; 分片原样拼接可复原全文 (含换行)。
function chunkPieces(text)
{
  const pieces = []
  for(const line of text.split('\n'))
  {
    if(line.length <= 12) { pieces.push(line + '\n'); continue }
    for(let i = 0; i < line.length; i += 12)
      pieces.push(line.slice(i, i + 12) + (i + 12 >= line.length ? '\n' : ''))
  }
  return pieces
}

const sseShell = delta => ({ id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'soulnotes-mock-llm', choices: [{ index: 0, delta, finish_reason: null }] })
const writeSse = (res, delta) => res.write(`data: ${JSON.stringify(sseShell(delta))}\n\n`)
const finishSse = res =>
{
  res.write(`data: ${JSON.stringify({ ...sseShell({}), choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

//* 课表工具出参 → 汇总回复: 只引用工具真实返回的条目, 查不到就如实说, 不编数据。
function timetableReply(raw)
{
  const items = []
  const re = /"course"\s*:\s*"([^"]+)"\s*,\s*"timeRange"\s*:\s*"([^"]+)"\s*,\s*"location"\s*:\s*"([^"]+)"/g
  for(let m; (m = re.exec(raw)) !== null && items.length < 4;) items.push(m.slice(1))
  if(items.length === 0)
    return '我刚刚帮你查了课表, 这次没取到条目, **可能是数据源还没就绪**。\n\n要不要过一会儿再试一次? 或者先跟我说说今天过得怎么样。'
  const rows = items.map(([c, t, l]) => `- **${c}**  ${t} @${l}`).join('\n')
  return `帮你看了下课表, **今天一共 ${items.length} 节课**, 原样贴给你:\n\n${rows}\n\n别赶太急, 路上给自己留足时间。需要我顺手帮你规划课间怎么安排吗?`
}

http.createServer(async (req, res) => {
  const body = await readBody(req)
  if(req.method === 'POST')
  {
    try
    {
      writeFileSync(new URL('./mock-llm-last-request.json', import.meta.url), body)  //* 最近一次 (兼容既有探针)
      appendFileSync(new URL('./mock-llm-requests.jsonl', import.meta.url), body.replace(/\r?\n/g, ' ') + '\n')  //* 全量流水
    }
    catch { /* 录制失败不影响服务 */ }
    let stream = false
    let j = null
    try { j = JSON.parse(body); stream = j.stream === true } catch { /* 非 JSON 按非流式 NONE 处理 */ }
    const json = obj => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
    //* 载荷形状逐字段对照项目 MockLlmServer.completionShell (id/created/model 缺席会被 quarkus-langchain4j 判为 error object)
    const shell = (object, choices) => ({ id: 'chatcmpl-mock', object, created: Math.floor(Date.now() / 1000), model: 'soulnotes-mock-llm', choices })
    const completion = content => json(shell('chat.completion', [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }]))
    //* 按 system prompt 锚点路由 (追问 Agent 提示词亦自称心声树洞, 故追问/标题/RED 必须先于共情对话判定; prod 下对话请求 tools 可为空数组, 不能以 tools 区分):
    if(body.includes(FOLLOWUP_ANCHOR)) return completion(JSON.stringify(FOLLOWUP_POOL[followupCursor++ % FOLLOWUP_POOL.length]))
    if(body.includes(TITLE_ANCHOR)) return completion(TITLE_POOL[titleCursor++ % TITLE_POOL.length])
    if(body.includes(RED_KEYWORD)) return completion(RED_DETECTION_JSON)
    if(body.includes('心声树洞'))
    {
      try { writeFileSync(new URL('./mock-llm-last-chat.json', import.meta.url), body) } catch { /* 录制失败不影响服务 */ }  //* 最近一次对话请求 (个性化组装断言专用)
      const hasTimetableTool = Array.isArray(j?.tools) && j.tools.some(t => t?.function?.name === TIMETABLE_TOOL)
      const userText = lastUserText(j)
      const toolRound = Array.isArray(j?.messages) && j.messages.some(m => m?.role === 'tool')
      //* 真实工具调用流: 首轮 (用户问课表 + 工具表在场) 回 tool_call, 交后端真实执行 query_timetable;
      //* 次轮 (messages 已含 role=tool 出参) 基于出参汇总 — "正在查询课表…" 指示由后端 tool-call SSE 事件真实驱动。
      if(hasTimetableTool && !toolRound && /课表|课程|今天的课|明天的课|下节课/.test(userText))
      {
        const call = { index: 0, id: 'call-mock-timetable', type: 'function', function: { name: TIMETABLE_TOOL, arguments: '{}' } }
        if(!stream) return json(shell('chat.completion', [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }]))
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        writeSse(res, { role: 'assistant', content: null })
        writeSse(res, { tool_calls: [call] })
        res.write(`data: ${JSON.stringify({ ...sseShell({}), choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`)
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      const reply = toolRound
        ? timetableReply(String([...(j?.messages ?? [])].reverse().find(m => m?.role === 'tool')?.content ?? ''))
        : pickReply(userText)
      if (toolRound) await new Promise(ok => setTimeout(ok, 2500))  //* R4 拍摄: 拉宽 tool-call 指示窗口 (工具执行+二轮往返仅 ~百毫秒,
      //* tool-call 事件与首 token 在同一网络分块内到达, React 同批渲染令标签无 DOM 窗口期 — 与 manifest 披露#6 拉宽窗口同口径)。
      if(!stream) return completion(reply)
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      for(const p of chunkPieces(reply))
        writeSse(res, { content: p })
      return finishSse(res)
    }
    return completion(NONE_DETECTION_JSON)
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ object: 'list', data: [] }))
}).listen(PORT, () => console.log(`mock-llm on :${PORT}`))
