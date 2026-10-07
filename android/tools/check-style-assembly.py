# -*- coding: utf-8 -*-
# 个性化组装断言 (mock-llm-last-chat.json): 安全序言在前 / 风格块在场 / witty 指令在场。
import io, json, sys

raw = io.open('D:/Code/Java/soul_notes/android/tools/mock-llm-last-chat.json', encoding='utf-8').read()
sys_prompt = ''
try:
    d = json.loads(raw)
    sys_prompt = next((m.get('content', '') for m in d.get('messages', []) if m.get('role') == 'system'), '')
except Exception as e:
    sys_prompt = raw  # JSON 解析失败则全文匹配
sentinel = '以下为表达风格偏好'
witty = ('吐槽达人' in sys_prompt) or ('玩梗' in sys_prompt)
pre = sys_prompt.find('安全规则')
st = sys_prompt.find(sentinel)
order = (pre != -1 and st != -1 and pre < st)
sys.stdout.buffer.write(('风格块哨兵=%s witty指令=%s 安全序言在前=%s | system头80字=%s\n' % (
    sentinel in sys_prompt, witty, order, sys_prompt[:80].replace('\n', ' '))).encode('utf-8'))
print('ASSERT-RESULT:', 'PASS' if (sentinel in sys_prompt and witty and order) else 'FAIL')
