#!/usr/bin/env bash
# 夜间保活: 每 4 分钟唤醒屏幕并拉亮度, 防止真机冒烟中途息屏 (ColorOS 30min 上限场景).
# 整夜运行不退出; adb 断线时自愈重试 (kill-server/start-server), 连续失败仅打点不退出.
while true; do
  DEV=$(adb devices 2>/dev/null | grep -c "device$")
  if [ "$DEV" -eq 0 ]; then
    adb kill-server >/dev/null 2>&1
    adb start-server >/dev/null 2>&1
    sleep 3
    DEV=$(adb devices 2>/dev/null | grep -c "device$")
  fi
  if [ "$DEV" -ge 1 ]; then
    adb shell svc power stayon true >/dev/null 2>&1
    adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1
    adb shell settings put system screen_brightness_mode 1 >/dev/null 2>&1
    adb shell settings put system screen_brightness 80 >/dev/null 2>&1
    echo "$(date +%H:%M:%S) keep-awake ok"
  else
    echo "$(date +%H:%M:%S) device-offline"
  fi
  sleep 240
done
