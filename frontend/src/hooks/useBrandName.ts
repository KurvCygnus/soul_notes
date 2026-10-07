//* 品牌域消费 hook (评审整改): 后端品牌配置的前端唯一事实源入口.
//* 模块级缓存: 整页会话只取一次 (品牌名/扩展板块名在会话期内不变), 各消费点 (标题/浮层/侧栏) 共享同一结果;
//* 兜底链: 后端不可达/字段缺失 → 中文产品名与 "扩展" 默认值 (与后端 @ConfigProperty defaultValue 对齐), 品牌拉取绝不阻塞渲染.
import { useEffect, useState } from 'react'
import { getBrand } from '../api/brand'

export const BRAND_FALLBACK = '心灵札记'
export const EXTENSIONS_LABEL_FALLBACK = '扩展'

//* 品牌域快照: 一次拉取解析出的全体展示名 (brand = 产品名, extensionsLabel = 扩展板块显示名, D7).
export interface IBrandSnapshot
{
    brand: string
    extensionsLabel: string
}

const FALLBACK: IBrandSnapshot = { brand: BRAND_FALLBACK, extensionsLabel: EXTENSIONS_LABEL_FALLBACK }

let cached: IBrandSnapshot | null = null
let pending: Promise<IBrandSnapshot> | null = null

function fetchOnce(): Promise<IBrandSnapshot>
{
    pending ??= getBrand().
        then(b =>
        {
            //* 兜底判据 = 字段缺席 (nullish) 或 trim 后为空即默认: ?. 只挡 null/undefined,
            //* 非字符串形态不在容忍面内 (会原样抛错, 契约值是纯展示名, 出厂前修剪空白).
            cached = {
                brand: b.brandName?.trim() || BRAND_FALLBACK,
                extensionsLabel: b.extensionsLabel?.trim() || EXTENSIONS_LABEL_FALLBACK,
            }
            return cached
        }).
        catch(() => FALLBACK)
    return pending
}

export function useBrandName(): IBrandSnapshot
{
    const [snapshot, setSnapshot] = useState<IBrandSnapshot>(cached ?? FALLBACK)
    useEffect(() =>
    {
        if(cached != null)
            return  //* 挂载前已有缓存: useState 初值即该值, 同步 setState 纯属多余 (且触发 lint 级联渲染告警).
        let alive = true
        fetchOnce().then(s => { if(alive) setSnapshot(s) })
        return () => { alive = false }
    }, [])
    return snapshot
}
