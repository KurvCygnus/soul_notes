//* 危机热线 API: 免认证读取 — 未登录 (登录页/会话失效) 场景也必须能取到号码, 这是离线安全网的上游数据源.
import { api } from './http'
import type { HotlineInfo } from '../types'

export const getHotline = (): Promise<HotlineInfo> =>
    api<HotlineInfo>('/api/v1/crisis/hotline', { auth: false })
