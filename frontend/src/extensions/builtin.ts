//* 内置扩展点注册处: Release 形态下平台零内置扩展点, 一切功能扩展均由注册表注入 (D8) —
//* 本文件先行固定目录形态与导出契约, 后续若新增内置点在此追加.
import type { IExtensionPoint } from './types'

export const builtinExtensions: IExtensionPoint[] = []
