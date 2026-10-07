# 心灵札记 (frontend)

面向高校学生的多模态 AI + 情感分析心理轻干预系统前端. 产品定位是"心理倾听者": 温暖, 不评判, 严格去医疗化表述. 全部配色经设计令牌 (`src/styles/tokens.css`) 下发, 组件层不写裸色值; 双主题 (雾杉 sage / 暮蓝 dusk) 经 `<html data-theme>` 挂载, 亮暗随系统 `prefers-color-scheme`, 默认 sage.

## 页面形态 (homepage-v2)

```text
┌────────┬──────────────────────────────┐
│ 侧栏    │ 主区 (路由容器, 切换淡入)        │
│ 手风琴  │  /              ChatView      │
│ ▸扩展  │  /workbench     咨询员工作台     │
│ ▸会话  │  /extensions    扩展总览        │
│ 头像行  │  /extensions/:id 扩展页        │
│        │  /settings      主题切换       │
└────────┴──────────────────────────────┘
```

- **手风琴侧栏** (`AppShell` + `Sidebar`): "扩展 / 会话" 两节互斥且必有一个展开 (节即路由, `sectionRoute` 映射), 可折叠成 48px 图标条 (持久化 `localStorage 'soul.sidebar'`), 底部头像行承载汉堡用户菜单与登录入口. 侧栏形态随角色切换: ADMIN 不可用会话, 侧栏只渲染 工作台/扩展治理/设置 三入口 (会话区整体退场); COUNSELOR/ADMIN 另有独立的工作台入口行.
- **聊天主区** (`ChatView`): hero 空态 (问候 + 居中输入盒) 与消息流双态切换; SSE 流式回复; 访客可读可试, 发送类交互一律过登录门 (`useChatGate`, 登录成功补发原动作); ADMIN 直达聊天位一律重定向工作台.
- **扩展体系** (`src/extensions/`): 编译期注册契约 (`IExtensionPoint`, 页面必填), 扩展贡献主页 chips 与总览; 内置点当前为空, campus 参考扩展 (课表/考试/日程) 随源码静态注册, dev/prod 共用同一注册表, 扩展页数据一律查后端真实扩展端点 (见下文"扩展注册产物断言").
- **每日总结** (`DailySummaryLine`): 输入区下方一行质性「今日总结」 (登录态限定), 点击展开最近列表 popover; 无总结/取数失败整件隐身 (fail-silent, 不重试, 不阻塞聊天).
- **全局浮层** (壳内单例, z-index 阶梯: 登录 60 < 抽屉遮罩 70 < 抽屉 80 < 危机 Flyout/菜单遮罩 85 < 用户菜单 86 < 删除确认 90 < RED 预警 100): `LoginSheet` (Escape 可关), `UserMenu` (汉堡菜单), `CrisisFlyout` (危机支持, 访客无门 — 产品红线), `ConfirmModal` (删除会话二次确认), `RedAlertModal` (**Escape 不关** — 必须显式"我知道了"或转危机 Flyout).
- 移动端 (<768px): 侧栏变 overlay 抽屉, 顶栏汉堡为唯一入口, 纯 CSS 媒体查询驱动, Escape/遮罩点击收起.

| 路由 | 视图 | 门 |
| --- | --- | --- |
| `/` | `ChatView` | 公开 (访客发送时开门; ADMIN 直达重定向 `/workbench`) |
| `/extensions`, `/extensions/:id` | 扩展总览 / 扩展页 | `RequireAdmin` (非 ADMIN 直达重定向首页, 不开登录门) |
| `/workbench` | 咨询员工作台 | `RequireRole` (COUNSELOR/ADMIN 专属, 其余身份直达重定向首页) |
| `/profile`, `/settings` | 占位页 / 设置页 | `RequireAuth` (访客渲染空并开门, 登录后原地放行) |
| `/crisis`, `*` | 重定向 `/` (危机入口已收进汉堡菜单 → Flyout) | — |

## 动效令牌

全部过渡/动画只允许引用 `tokens.css` 的动效令牌, 组件禁止裸写毫秒/缓动 (集中调档才能全局统一节奏):

- 时长: `--dur-fast` 150ms (微交互) / `--dur-base` 220ms (浮层与路由) / `--dur-slow` 320ms (加载脉冲) / `--dur-blink` 1s (流式光标与录音红点的状态闪烁, 刻意独立于过渡档以免频闪).
- 缓动: `--ease-enter` (入场) / `--ease-exit` (离场).
- 已覆盖场景: 侧栏宽度过渡与箭头旋转, 手风琴内容淡入, 主区路由切换淡入 (`AppShell` 以 `key=pathname` 重挂 `.main-route` 重放), 浮层家族统一入场 `.anim-pop` (淡入 + 0.97 缩放: 登录/危机 Flyout/删除确认/RED 弹窗), 用户菜单上弹, 每日总结 popover 淡入, 移动抽屉滑入, 扩展页加载脉冲.
- `prefers-reduced-motion: reduce` 时全局 `animation/transition: none !important` 一网打尽.

## 扩展注册产物断言

Mock 扩展退役转正后, `registry.ts` 不再分构建形态 (旧 `import.meta.env.PROD ? [] : mockExtensions` 剔除分支已随 mocks 目录退役), 扩展页数据一律查后端真实扩展端点 (`/api/v1/ext/{name}/query`). `pnpm build` 末尾运行 `scripts/check-prod-extensions.mjs`: 扫描 `dist/assets/*.js`, 必须找到全部真实扩展注册标识 (`timetable`/`exams`/`agenda`) — 若有人重新引入构建形态门控, 扩展子树会被常量折叠 + 摇树剔除, 字符串字面量随之消失, 断言即失败退出, 禁止发布 (vitest 跑在 PROD=false, 测试侧测不出该回归, dist 扫描是唯一守卫).

## 后端契约边界

- **统一 REST**: 全量路径 `/api/v1/...` (前端不做前缀拼接, 依赖 Vite/网关按 `/api` 转发). `api()` 统一注入 JWT 并解包 `{code,message,data}` 壳; 业务失败 / HTTP 失败 / 网络故障统一以 `ApiError` 拒绝 (网络恒 `code = -1`); 仅主动取消的 `AbortError` 原样透传. 401 广播全局回调 (清门 + 弹登录).
- **JWT**: localStorage `soul.token`, `Authorization: Bearer` 注入; 登录/注册/热线/品牌等免认证端点 `auth: false`.
- **SSE 流式对话**: `POST /api/v1/chat/stream`. 流首 **meta 事件** (`type === 'meta'` 且 `sessionId` 为 string) 回传服务端实际使用的会话 ID, 其后事件均为增量 token; 响应是事件流而非 data 壳, 故裸用 fetch 不走统一解包.
- **时间戳可空**: 流式消息无 `timestamp` (可选); 历史消息 `ts: string | null` — 存量消息为 null, 不参与时间分组, 归入"当前"桶.
- **语音上传**: 前端硬顶 60s (`MAX_RECORD_SECONDS`) 与 7MB (`MAX_RECORD_BYTES = 7 * 1024 * 1024`), 超限在上传前拦截 (不发起必然被后端 413 拒绝的请求); 转写文本回填输入框, 由用户审阅后手动发送 (不自动发送, 产品裁决).
- **热线三级缓存 (离线安全网)**: `API → localStorage (soul.hotline) → 内置默认号码`, 逐级降级且**永不 reject**; 形态守卫拒绝渲染空号码. 后端/AI/网络全灭时, RED 弹窗与危机 Flyout 仍能展示可拨打的求助热线.
- **WS 预警通道**: `/ws/alert` (按 `/ws` 前缀单独转发, 与 REST 代理规则不同). 指数退避重连 3s→30s 封顶, 连接成功归零; 关闭函数幂等; 随登录态建连/断开. `reason` 为前端归一化字段 (后端 `message` 的别名); RED 预警只走此在线链, 前端无第二条开弹窗路径 (日记域兜底已退场). 同通道还承载扩展通知帧 `ext-notification` — 严格结构判据通过才路由至前台横幅/后台壳桥, 形状残缺静默丢弃 (第三方扩展接入见仓库根 [EXTENSIONS.md](../EXTENSIONS.md)).
- **主页 chips 策略**: 总可见上限 4 条 (`HOME_CHIP_CAP`); 排序 = 扩展贡献在前, 内置 3 条通用情绪话题在后; 超限时内置从尾部开始丢弃. 文案红线: 通用简单话题, 非医疗化, 不指向具体会话/数据查询; 访客点 chips 只开门不直发.
- **品牌配置**: `/api/v1/brand` 免认证下发产品名与扩展板块显示名, 前端零硬编码, 缺省兜底 "心灵札记" / "扩展" (`useBrandName` 模块级缓存, 会话期只取一次).
- **每日总结**: 今日总结 + 最近列表两个登录态端点; 形态守卫把 `data` 缺席/坏形态一律视同"无总结" (绝不渲染「undefined」).
- **情境摘要**: `ContextSummary` 三数组 (课表/考试/日程) 可缺省 (后端 NON_NULL), `asList` 归一; 扩展页经只读 query client 消费, 请求失败由扩展页自降级, 绝不阻塞聊天主路径.

## SSE 解析陷阱

实现在 `src/utils/sse.ts`, 消费方式见 `src/api/chat.ts`:

- **帧跨 chunk 拆分**: `data:` 帧会被网络层任意切开, 半截事件必须留在缓冲区等下一个 chunk 补齐, 否则流式输出丢字; `end()` 时冲刷残留 (服务端可能不带结尾空行就关流).
- **CRLF / 混合换行**: 以 `/\r?\n\r?\n/` 切事件块, 同时覆盖 `\n\n`, `\r\n\r\n` 及混合风格.
- **多条 `data:` 行**: 同一事件多条 data 行按 SSE 规范以 `\n` 连接; 字段名后的前导空格至多剥一个 (负载自身空格保留); 注释行与空负载 (keep-alive) 不派发.
- **多字节半截序列**: `TextDecoder` 以 `{stream: true}` 增量解码, 流结束后再 `decode()` 冲刷, 防止尾部中文 token 丢字.

## 目录速览

```text
src/
├── api/        #* HTTP 壳 (http.ts) / SSE 流式 (chat.ts + sse.ts) / WS 预警 (ws.ts) / 热线缓存 (hotline.ts) / 品牌 (brand.ts) / 总结 (summary.ts)
├── components/ #* layout (壳+侧栏+菜单) / chat (流+输入盒) / auth / alert / crisis / summary / ui (Icon+ConfirmModal)
├── context/    #* AuthContext (令牌+用户) / AlertContext (RED 预警全局唯一, WS 通道生命周期)
├── extensions/ #* registry (注册表) / types (编译期契约) / helpers (页面原语) / builtin / campus (课表/考试/日程参考实现)
├── hooks/      #* useAuth / useAlert / useChatGate (登录门) / useChatSend (发送状态机) / useBrandName / useDailySummary
├── utils/      #* sse / group (时间分组+相对时间) / audio (录音) / theme (双主题) / sidebarSections / toast
├── views/      #* ChatView (主视图) / PlaceholderView / SettingsView / chatContext (壳↔视图通道契约)
└── styles/     #* tokens.css (双主题四块 + 动效令牌) + base.css (组件样式, reduced-motion 总闸)
```

## 测试与 CI

- `pnpm dev` — 本地开发 (5173, `/api` → `localhost:8080`, `/ws` WebSocket 代理).
- `pnpm test` — vitest run (jsdom 环境, 全局断言, `src/test/setup.ts` 装 jest-dom).
- `pnpm build` — `tsc --noEmit` 类型先行, 通过后 `vite build`, 末尾跑扩展注册产物断言 (见上文).
- `pnpm lint` — oxlint.
- CI (`.github/workflows/frontend.yml`): push 到 `forward-iterating` (frontend/** 路径过滤) 与 PR 触发; pnpm 12 + Node 22, `--frozen-lockfile` 安装后跑 build + test. Lint 目前为本地门禁, 不在 CI 步骤内.

## 无障碍与安全红线

- 聊天流 `aria-live="polite"`; 图标按钮全量 `aria-label`; 手风琴节/折叠钮/抽屉汉堡均带 `aria-expanded` + `aria-controls`.
- 移动端 (<768px) 左栏抽屉化: 纯 CSS 媒体查询驱动 overlay, 顶栏汉堡为唯一入口, Escape/遮罩点击收起; `>= 768px` 桌面形态不受影响.
- `prefers-reduced-motion: reduce` 时全局关闭动画与过渡.
- 危机支持入口 (汉堡菜单 → Flyout) 对访客可见无门; RED 预警弹窗 `role="alertdialog"` 且不响应 Escape; 热线兜底见上文三级缓存.
