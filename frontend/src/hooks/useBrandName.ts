//* 品牌名消费 hook (评审整改): 后端品牌配置的前端唯一事实源入口.
//* 模块级缓存: 整页会话只取一次 (品牌名在会话期内不变), 各消费点 (标题/浮层) 共享同一结果;
//* 兜底链: 后端不可达/字段缺失 → 中文产品名 (与 index.html 静态标题一致), 品牌拉取绝不阻塞渲染.
import { useEffect, useState } from 'react'
import { getBrand } from '../api/brand'

export const BRAND_FALLBACK = '心灵札记'

let cached: string | null = null
let pending: Promise<string> | null = null

function fetchOnce(): Promise<string>
{
    pending ??= getBrand().
        then(b => { cached = b.brandName?.trim() !== '' ? b.brandName : BRAND_FALLBACK; return cached }).
        catch(() => BRAND_FALLBACK)
    return pending
}

export function useBrandName(): string
{
    const [name, setName] = useState(cached ?? BRAND_FALLBACK)
    useEffect(() =>
    {
        if(cached != null)
            return  //* 挂载前已有缓存: useState 初值即该值, 同步 setState 纯属多余 (且触发 lint 级联渲染告警).
        let alive = true
        fetchOnce().then(n => { if(alive && n !== '') setName(n) })
        return () => { alive = false }
    }, [])
    return name
}
