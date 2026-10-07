//* 今日总结消费 hook: 挂载时拉取一次, 失败/null 一律落 null — 三态降级的"无"态由消费方渲染为空.
//* 不做模块级缓存 (区别于 [[useBrandName]]): 总结随日记生成而变, 每次挂载取新鲜值, 端点轻量不值得缓存簿记.
import { useEffect, useState } from 'react'
import { getDailySummary } from '../api/summary'
import type { DailySummaryVo } from '../types'

export function useDailySummary(): DailySummaryVo | null
{
    const [summary, setSummary] = useState<DailySummaryVo | null>(null)
    useEffect(() =>
    {
        let alive = true
        getDailySummary().
            then(s => { if(alive) setSummary(s) }).
            catch(() =>
            {
                //! 失败即无 (网络断/401/5xx 同漏斗): 静默落 null 且绝不重试 — 无 401 死循环, 聊天主路径零打扰.
            })
        return () => { alive = false }
    }, [])
    return summary
}
