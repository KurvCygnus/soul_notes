//* 危机支持页 (公开路由, 产品红线: 访客可达且不设登录门).
//* 数据源: getCachedHotline 三级缓存 — 状态初值取内置默认 (同步常量, 零网络完整可读), 缓存到达后原位刷新;
//* 结构: 热线卡 (名称/主号/备号/寄语, 均可拨打) + 预约入口卡 (appointmentUrl 空串则整卡隐藏) + 110/120 静态提示.
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { getCachedHotline, DEFAULT_HOTLINE } from '../api/hotline'
import type { HotlineInfo } from '../types'

export default function CrisisView(): ReactElement
{
    const [hotline, setHotline] = useState<HotlineInfo>(DEFAULT_HOTLINE)

    useEffect(() =>
    {
        let alive = true
        getCachedHotline().then(info =>
        {
            if(alive)
                setHotline(info)
        }).
            catch(() =>
            {
                //! getCachedHotline 契约上不 reject, 此处纯防御: 保持默认号码, 危机页永不空号码.
            })
        return () => { alive = false }
    }, [])

    return (
        <div className="crisis-view">
            <h1>危机支持</h1>
            <p className="crisis-lead">如果你此刻感到不安全, 请立即求助. 你不是一个人, 这些渠道随时愿意接住你.</p>
            <section className="card crisis-card" aria-label="心理援助热线">
                <h2>{hotline.name}</h2>
                <a className="crisis-phone" href={`tel:${hotline.primary}`}>{hotline.primary}</a>
                <p>备用热线: <a href={`tel:${hotline.backup}`}>{hotline.backup}</a></p>
                {hotline.message !== '' && <p className="crisis-message">{hotline.message}</p>}
            </section>
            {hotline.appointmentUrl !== '' && (
                <section className="card crisis-card" aria-label="预约心理咨询">
                    <h2>预约学校咨询</h2>
                    <p>
                        <a href={hotline.appointmentUrl} target="_blank" rel="noopener noreferrer">前往预约入口</a>
                    </p>
                </section>
            )}
            <p className="crisis-emergency">紧急情况 (人身安全受到威胁) 请立即拨打 110 或 120.</p>
        </div>
    )
}
