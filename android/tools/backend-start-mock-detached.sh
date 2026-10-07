#!/usr/bin/env bash
# P3 真机回归临时启动器: 以 MOCK_LLM=1 分离启动后端并重定向日志.
# 存在原因: PowerShell 5.1 Start-Process 的 ArgumentList 对含空格参数不自动加引号,
# bash -c "长命令" 会被拆词, 故把重定向与 MOCK 开关包进本脚本, 外层只传一个无空格参数.
MOCK_LLM=1 exec /d/Code/Java/soul_notes/android/tools/backend-start.sh >> /d/Code/Java/soul_notes/bin/main/backend-p3-regression.log 2>&1
