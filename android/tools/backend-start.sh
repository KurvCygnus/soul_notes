#!/usr/bin/env bash
# 后端夜间拉起脚本: Pre-Launch 校验所需 SOULNOTES_* 环境层一次性注入 (2026-10-04 定时任务用).
# 注意: bash 注释只能用 # — 项目的 //* 约定在 shell 语境非法.
export SOULNOTES_DB_URL="postgresql://127.0.0.1:5432/soulnotes"
export SOULNOTES_DB_USER="kurv"
export SOULNOTES_DB_PASSWORD="DOOM1Sf0r3v3r"
export SOULNOTES_JWT_SECRET="9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08c3a2e4b8f6a1d9c7e5b3f2d1c9a7b5e3f2d1c9a7b5e3f2d1c"
export SOULNOTES_AI_ENDPOINT="https://open.bigmodel.cn/api/coding/paas/v4"
export SOULNOTES_AI_MODEL="glm-5.3-flash"
export SOULNOTES_AI_API_KEY="REDACTED-rotate-your-key"
# MOCK_LLM=1 时切换本地零 token 假端点 (先启动 android/tools/mock-llm.mjs): 用户指令 2026-10-06 — 测试一律不烧真实 Key.
if [ "${MOCK_LLM:-0}" = "1" ]; then
  export SOULNOTES_AI_ENDPOINT="http://127.0.0.1:8123"
  export SOULNOTES_AI_MODEL="mock-chat"
  export SOULNOTES_AI_API_KEY="mock-key"
fi
export SOULNOTES_CORS_ORIGINS="https://appassets.androidplatform.net,http://localhost:5173"
export SOULNOTES_ALERT_COOLDOWN_MINUTES=1
export SOULNOTES_AI_MAX_TOKENS=2048
export JDK_JAVA_OPTIONS="--enable-native-access=ALL-UNNAMED"
cd /d/Code/Java/soul_notes/bin/main || exit 1
exec "C:/Users/Lenovo/.jdks/graalvm-ce-25.0.2/bin/java.exe" -jar D:/Code/Java/soul_notes/backend/build/quarkus-app/quarkus-run.jar
