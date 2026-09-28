//* 危机支持页 (公开路由, 产品红线: 访客可达且不设登录门).
//* 当前为骨架态: 热线/预约内容为加载占位, Task 13 经三级缓存数据源 (getCachedHotline) 注入真实号码与链接.
//* 结构先行: 热线卡 + 预约入口卡 + 110/120 提示, 即使数据缺失页面也必须完整可读 (离线安全网).
import type { ReactElement } from 'react'

export default function CrisisView(): ReactElement
{
    return (
        <div className="crisis-view" aria-busy="true">
            <h1>危机支持</h1>
            <p className="crisis-lead">如果你此刻感到不安全, 请立即求助. 你不是一个人, 这些渠道随时愿意接住你.</p>
            <section className="card crisis-card" aria-label="心理援助热线">
                <h2>心理援助热线</h2>
                <p className="crisis-loading">热线信息加载中...</p>
            </section>
            <section className="card crisis-card" aria-label="预约心理咨询">
                <h2>预约学校咨询</h2>
                <p className="crisis-loading">预约入口加载中...</p>
            </section>
            <p className="crisis-emergency">紧急情况 (人身安全受到威胁) 请立即拨打 110 或 120.</p>
        </div>
    )
}
