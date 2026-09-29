# 心灵札记 (frontend)

面向高校学生的多模态 AI + 情感分析心理轻干预系统前端. 产品定位是"心理倾听者": 温暖, 不评判, 严格去医疗化表述. 深色主题跟随系统 (`prefers-color-scheme`), 全部配色经设计令牌 (`src/styles/tokens.css`) 下发, 组件层不写裸色值.

## 技术栈

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| React / react-dom | 19 | UI (函数组件 + hooks, StrictMode) |
| react-router-dom | 7 | 路由 (`/` 聊天, `/crisis` 危机支持) |
| react-markdown + remark-gfm | 10 / 4 | AI 回复的 Markdown 渲染 (表格/删除线等 GFM 扩展) |
| TypeScript | ~6.0 | `tsc --noEmit` 严格检查 (含 noUnused*) |
| Vite | 8 | 构建 + dev server 代理 (`/api`, `/ws`) |
| vitest + Testing Library + jsdom | 5 / 16 / 30 | 单测与组件测试 (`@testing-library/jest-dom`, `user-event`) |
| oxlint | 1.x | Lint (`pnpm lint`) |
| pnpm | 12 | 包管理 (CI 固定同 major, 见 `.github/workflows/frontend.yml`) |

## 目录速览

```text
src/
├── api/        #* HTTP 壳 (http.ts) / SSE 流式 (chat.ts + sse.ts) / WS 预警 (ws.ts) / 热线缓存 (hotline.ts)
├── components/ #* layout (壳+侧栏) / chat / auth / alert / weather / sidebar (情境卡)
├── context/    #* AuthContext (令牌+用户) / AlertContext (RED 预警全局唯一)
├── hooks/      #* useAuth / useAlert / useChatGate (登录门) / useChatSend (发送状态机)
├── utils/      #* sse / group (时间分组+相对时间) / audio (录音) / weatherGlyph / toast
├── views/      #* ChatView (主视图) / CrisisView (公开)
└── styles/     #* tokens.css (亮暗令牌组) + base.css (组件样式)
```

## 页面

| 路由 | 视图 | 说明 |
| --- | --- | --- |
| `/` | `ChatView` | 聊天主视图: hero 问候, SSE 流式回复, 会话列表, 记一笔/语音/情境卡入口 |
| `/crisis` | `CrisisView` | 危机支持页, 公开路由 (不设登录门, 产品红线) |
| `*` | 重定向 `/` | 未知路径兜底 |

全局浮层 (壳内单例): `LoginSheet` (登录, Escape 可关), `RedAlertModal` (RED 预警, **Escape 不关** — 必须显式"我知道了"或跳危机页), 顶栏 `WeatherCapsule`.

## 后端契约边界

- **统一 REST**: 全量路径 `/api/v1/...` (前端不做前缀拼接, 依赖 Vite/网关按 `/api` 转发). `api()` 统一注入 JWT 并解包 `{code,message,data}` 壳; 业务失败 / HTTP 失败 / 网络故障统一以 `ApiError` 拒绝 (网络恒 `code = -1`); 仅主动取消的 `AbortError` 原样透传. 401 广播全局回调 (清门 + 弹登录).
- **JWT**: localStorage `soul.token`, `Authorization: Bearer` 注入; 登录/注册/热线等免认证端点 `auth: false`.
- **SSE 流式对话**: `POST /api/v1/chat/stream`. 流首 **meta 事件** (`type === 'meta'` 且 `sessionId` 为 string) 回传服务端实际使用的会话 ID, 其后事件均为增量 token; 响应是事件流而非 data 壳, 故裸用 fetch 不走统一解包.
- **时间戳可空**: 流式消息无 `timestamp` (可选); 历史消息 `ts: string | null` — 存量消息为 null, 不参与时间分组, 归入"当前"桶.
- **语音上传**: 前端硬顶 60s (`MAX_RECORD_SECONDS`) 与 7MB (`MAX_RECORD_BYTES = 7 * 1024 * 1024`), 超限在上传前拦截 (不发起必然被后端 413 拒绝的请求); 转写文本回填输入框, 由用户审阅后手动发送 (不自动发送, 产品裁决).
- **热线三级缓存 (离线安全网)**: `API → localStorage (soul.hotline) → 内置默认号码`, 逐级降级且**永不 reject**; 形态守卫拒绝渲染空号码. 后端/AI/网络全灭时, RED 弹窗与危机页仍能展示可拨打的求助热线.
- **WS 预警通道**: `/ws/alert` (按 `/ws` 前缀单独转发, 与 REST 代理规则不同). 指数退避重连 3s→30s 封顶, 连接成功归零; 关闭函数幂等. `reason` 为前端归一化字段 (后端 `message` 的别名).
- **情境摘要**: `ContextSummary` 三数组 (课表/考试/日程) 可缺省 (后端 NON_NULL), `asList` 归一; 三数组全空整区隐藏, 请求失败静默不重试 (fail-silent, 绝不阻塞聊天主路径).

## SSE 解析陷阱

实现在 `src/utils/sse.ts`, 消费方式见 `src/api/chat.ts`:

- **帧跨 chunk 拆分**: `data:` 帧会被网络层任意切开, 半截事件必须留在缓冲区等下一个 chunk 补齐, 否则流式输出丢字; `end()` 时冲刷残留 (服务端可能不带结尾空行就关流).
- **CRLF / 混合换行**: 以 `/\r?\n\r?\n/` 切事件块, 同时覆盖 `\n\n`, `\r\n\r\n` 及混合风格.
- **多条 `data:` 行**: 同一事件多条 data 行按 SSE 规范以 `\n` 连接; 字段名后的前导空格至多剥一个 (负载自身空格保留); 注释行与空负载 (keep-alive) 不派发.
- **多字节半截序列**: `TextDecoder` 以 `{stream: true}` 增量解码, 流结束后再 `decode()` 冲刷, 防止尾部中文 token 丢字.

## 测试与 CI

- `pnpm dev` — 本地开发 (5173, `/api` → `localhost:8080`, `/ws` WebSocket 代理).
- `pnpm test` — vitest run (jsdom 环境, 全局断言, `src/test/setup.ts` 装 jest-dom).
- `pnpm build` — `tsc --noEmit` 类型先行, 通过后才 `vite build`.
- `pnpm lint` — oxlint.
- CI (`.github/workflows/frontend.yml`): push 到 `forward-iterating` (frontend/** 路径过滤) 与 PR 触发; pnpm 12 + Node 22, `--frozen-lockfile` 安装后跑 build + test. Lint 目前为本地门禁, 不在 CI 步骤内.

## 无障碍与安全红线

- 聊天流 `aria-live="polite"`; 图标按钮全量 `aria-label`; 折叠/抽屉/胶囊均带 `aria-expanded`.
- 移动端 (<768px) 左栏抽屉化: 纯 CSS 媒体查询驱动 overlay, 顶栏汉堡为唯一入口, Escape/遮罩点击收起; `>= 768px` 桌面形态不受影响.
- `prefers-reduced-motion: reduce` 时全局关闭动画与过渡.
- 危机支持入口对访客可见; RED 预警弹窗 `role="alertdialog"` 且不响应 Escape; 热线兜底见上文三级缓存.
