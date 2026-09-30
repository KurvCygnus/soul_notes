//* Mock 扩展注册处: 仅开发构建打包 (registry 按 import.meta.env.PROD 剔除), Release 零残留 (D10).
//* 当前为空 — mock 课表/日程扩展由 Task 4 落地; 禁止在本任务伪造占位 Mock.
import type { IExtensionPoint } from '../types'

export const mockExtensions: IExtensionPoint[] = []
