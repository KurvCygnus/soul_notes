import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { applyTheme, getStoredMode, getStoredTheme, subscribeSystemMode } from './utils/theme'

//* 系统明暗实时跟随 (外观定稿): OS 翻转 -> 以存储偏好整体重应用 — mode=system 时 data-mode 随之切换,
//* 手动档重应用为写同值的幂等空转. 首帧前的系统档已由 index.html 早脚本落 data-mode, 此订阅只管运行期变化.
subscribeSystemMode(() => applyTheme(getStoredTheme(), getStoredMode()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
