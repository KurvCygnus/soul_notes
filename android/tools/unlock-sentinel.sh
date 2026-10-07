#!/usr/bin/env bash
# 解锁哨兵: 每 60s 探一次 keyguard, 解锁即退出 (exit 0), 供上层感知可恢复真机冒烟.
while true; do
  KG=$(adb shell dumpsys window 2>/dev/null | grep -c "isKeyguardShowing=true")
  DEV=$(adb devices | grep -c "device$")
  if [ "$DEV" -eq 0 ]; then echo "device-lost"; exit 2; fi
  if [ "$KG" -eq 0 ]; then echo "unlocked"; exit 0; fi
  sleep 60
done
