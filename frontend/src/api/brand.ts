//* 品牌域 API (评审整改): 品牌名是部署配置 (后端 app.brand-name / SOULNOTES_BRAND_NAME), 前端不得硬编码.
//* 免认证公开端点 (登录前就要用于标题/浮层), 失败语义交调用方兜底 — 本模块只负责契约与免 token 注入.
import { api } from './http'

export interface BrandInfo
{
    brandName: string
}

export const getBrand = (): Promise<BrandInfo> => api<BrandInfo>('/api/v1/brand', { auth: false })
