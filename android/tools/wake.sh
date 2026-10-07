#!/usr/bin/env bash
# 夜间冒烟唤屏工具: 定时任务反复需要屏幕常亮/解锁 — 截屏与触控分发都要求亮屏.
adb shell input keyevent KEYCODE_WAKEUP
sleep 0.6
adb shell input keyevent 82
sleep 0.6
# 亮屏保持: 30s 不操作会再锁, 冒烟节奏内每次板卡前重跑本脚本即可.
adb shell settings put system screen_off_timeout 600000 2>/dev/null
echo woke
