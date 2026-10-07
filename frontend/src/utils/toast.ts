//? 全局 toast: 模块级 store + useSyncExternalStore 订阅, 根部挂载一次 <ToastHost/> 即全局可用.
//? 文件按简报保持 .ts, 故以 createElement 代替 JSX; 样式内联并取设计令牌变量, 不外溢 CSS 文件.
import { createElement, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'

export type ToastKind = 'info' | 'success' | 'error'

type ToastEntry = { id: number; msg: string; kind: ToastKind }

let nextId = 1
//* entries 整体替换而非原地修改, 保证 useSyncExternalStore 快照引用稳定无撕裂.
let entries: readonly ToastEntry[] = []
const listeners = new Set<() => void>()

const emit = (): void => { for(const notify of listeners) notify() }
const getSnapshot = (): readonly ToastEntry[] => entries

const subscribe = (notify: () => void): (() => void) =>
{
    listeners.add(notify)
    return () => { listeners.delete(notify) }
}

const dismiss = (id: number): void =>
{
    entries = entries.filter(e => e.id !== id)
    emit()
}

//* 全局提示: 默认 3.2s 自动消退 (durationMs 可加长 — 扩展通知前台横幅用更长驻留档), 点击条目可提前关闭.
export const toast = (msg: string, kind: ToastKind = 'info', durationMs = 3200): void =>
{
    const id = nextId++
    entries = [...entries, { id, msg, kind }]
    emit()
    setTimeout(() => dismiss(id), durationMs)
}

//region ToastHost

const KIND_STYLE: Record<ToastKind, CSSProperties> = {
    info:    { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line-strong)' },
    success: { background: 'var(--brand)', color: 'var(--brand-ink)', border: '1px solid var(--brand)' },
    error:   { background: 'var(--danger)', color: '#ffffff', border: '1px solid var(--danger)' },
}

const HOST_STYLE: CSSProperties = {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 80, pointerEvents: 'none',
}

const ITEM_STYLE: CSSProperties = {
    borderRadius: 'var(--radius)', padding: '8px 16px', boxShadow: 'var(--shadow)',
    fontSize: '14px', pointerEvents: 'auto', cursor: 'pointer',
}

//* 渲染当前快照; role=status 让读屏器以 polite 级播报.
export const ToastHost = (): ReactElement =>
{
    const snapshot = useSyncExternalStore(subscribe, getSnapshot)
    return createElement('div', { style: HOST_STYLE },
        snapshot.map(e => createElement('div',
            { key: e.id, role: 'status', onClick: () => dismiss(e.id), style: { ...KIND_STYLE[e.kind], ...ITEM_STYLE } },
            e.msg)))
}

//endregion
