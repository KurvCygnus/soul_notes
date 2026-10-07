//* jsdom 不实现 window.matchMedia (直接是 undefined), 外观 system 档的解析与监听必须有桩才能在测试中运行;
//* 桩设计为可编程单例: 共享 setup 装一份"恒亮"缺省桩 (壳级/页面级用例零感知即不崩), 需要翻转语义的用例
//* (主题模块测试) 可随时再装一份可控桩覆盖 — [[vi.stubGlobal]] 后装先赢, matchMedia 每次调用返回当前桩.
import { vi } from 'vitest'

type ChangeListener = (event: MediaQueryListEvent) => void

export interface MatchMediaStub
{
    readonly matches: boolean
    readonly listenerCount: number
    flip(matches: boolean): void
}

export function installMatchMediaStub(initialMatches = false): MatchMediaStub
{
    let matches = initialMatches
    const listeners = new Set<ChangeListener>()
    //* 单例 MQL: 主题模块只监听 (prefers-color-scheme: dark) 一条查询, 桩无需按 query 串区分.
    const mql = {
        get matches() { return matches },
        addEventListener(_type: 'change', listener: ChangeListener): void { listeners.add(listener) },
        removeEventListener(_type: 'change', listener: ChangeListener): void { listeners.delete(listener) },
    }
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => mql))
    return {
        get matches() { return matches },
        get listenerCount() { return listeners.size },
        flip(next: boolean)
        {
            matches = next
            const event = { matches: next } as MediaQueryListEvent//! 桩只喂 matches 一个字段, 消费方不得依赖事件其余字段.
            for(const listener of [...listeners])
                listener(event)
        },
    }
}
