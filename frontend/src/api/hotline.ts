//* 危机热线三级缓存 (离线安全网核心): API → localStorage → 内置默认, 逐级降级且永不 reject.
//* 顺序依据: API 最新鲜 (成功即回写本地 = 缓存刷新), localStorage 存上次会话落盘, 默认常量最终保底 —
//* 三级全灭 (零网络 + 首次访问) 时仍能展示可用号码, 这是产品红线, 故本模块把"绝不抛错"视为契约.
import { getHotline } from './crisis'
import type { HotlineInfo } from '../types'

//* localStorage 落盘键 (brief 指定): 与 soul.token 同一命名空间.
export const HOTLINE_STORAGE_KEY = 'soul.hotline'

//* 内置默认热线 (brief 指定): 与后端种子配置一致; 全部数据源失效时的最终兜底.
export const DEFAULT_HOTLINE: HotlineInfo = {
    name: '24 小时心理援助热线',
    primary: '400-161-9995',
    backup: '12355',
    message: '',
    appointmentUrl: '',
}

//* 缓存形态守卫: 合法 JSON 但结构不符 (历史版本残留/人为篡改) 视为损坏 —
//* 安全网宁可退默认号码, 也绝不把 undefined 渲染成可拨打的电话.
function isUsable(info: unknown): info is HotlineInfo
{
    return typeof info === 'object' && info != null
        && typeof (info as HotlineInfo).primary === 'string'
        && (info as HotlineInfo).primary !== ''
}

export async function getCachedHotline(): Promise<HotlineInfo>
{
    //* 第一级: 在线 API. 成功即回写 localStorage (缓存刷新); 写入失败 (隐私模式/配额) 只降级缓存, 不影响返回.
    try
    {
        const info = await getHotline()
        if(!isUsable(info))
            throw new Error('hotline payload unusable')  //! API 形态不符 (号码为空) 视同失败: 安全网宁可降级, 绝不渲染空号码, 也不把坏数据落盘污染缓存.
        try { localStorage.setItem(HOTLINE_STORAGE_KEY, JSON.stringify(info)) }
        catch
        {
            //! localStorage 不可写不构成失败: 号码已到手, 缓存缺席只影响下次离线兜底.
        }
        return info
    }
    catch
    {
        //* API 失败 (网络断/401/5xx/形态不符) 静默降级下一级: 本函数是安全网, 上游异常不得外泄给弹窗/危机页.
    }

    //* 第二级: 本地缓存. 容错解析: 非法 JSON 或形态不符均视为损坏, 直接落默认.
    try
    {
        const raw = localStorage.getItem(HOTLINE_STORAGE_KEY)
        if(raw != null)
        {
            const parsed: unknown = JSON.parse(raw)
            if(isUsable(parsed))
                return { ...DEFAULT_HOTLINE, ...parsed }  //* 字段补齐: 历史缓存缺字段时以默认值填缝.
        }
    }
    catch
    {
        //! JSON.parse 抛错即缓存损坏: 跳过该级, 绝不让解析异常冒泡.
    }

    //* 第三级: 内置默认 — 零网络场景的最终兜底 (产品红线).
    return DEFAULT_HOTLINE
}
