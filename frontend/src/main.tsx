import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { applyTheme, getStoredMode, getStoredTheme, installShellModeBridge, subscribeSystemMode } from './utils/theme'
import { applyChatFont, getStoredChatFont } from './utils/chatFont'

//* 系统明暗实时跟随 (外观定稿): OS 翻转 -> 以存储偏好整体重应用 — mode=system 时 data-mode 随之切换,
//* 手动档重应用为写同值的幂等空转. 首帧前的系统档已由 index.html 早脚本落 data-mode, 此订阅只管运行期变化.
subscribeSystemMode(() => applyTheme(getStoredTheme(), getStoredMode()))

//* 壳层系统态订阅 (D1 防御修复): 安卓壳经 window.__SoulShell.onSystemModeChange 前推真实夜间态,
//* 推送即以存储偏好整体重应用 (与上方 matchMedia 订阅同参同语义) — 真机壳内 matchMedia 可被厂商
//* 深色兼容层钉死, 壳层上报才是"跟随系统"的第一数据源, 解析优先级见 theme.ts#resolveEffectiveMode.
installShellModeBridge(() => applyTheme(getStoredTheme(), getStoredMode()))

//* 冷启动初始应用 (评审 Important): 早脚本只写 data 属性不触系统栏上报桥 — 无此行时持久化了
//* 非默认主题的用户进设置页前系统栏恒错. 与订阅同参, 幂等空转.
applyTheme(getStoredTheme(), getStoredMode())

//* 聊天字号启动恢复 (Task 4): React 入口内把存储值落成 --fs-chat 内联令牌, 与设置页共用 [[applyChatFont]] 一条管线.
//* 不走 index.html 早脚本: 字号非首帧关键路径 — 主题错档会整屏闪错配色, 字号错档只闪正文一档大小,
//* FOUC 代价可接受, 换 index.html 保持零业务逻辑 (早脚本只留主题/外观两个 data 属性).
applyChatFont(getStoredChatFont())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
