//* 扩展通知开关 (P3, spec §2): 详情页"开启提醒" — 按用户×扩展 opt-in (默认零通知), 写 Redis 开关端点
//* (PUT /api/v1/ext/{name}/notify, 见 api/ext). 契约仅写无读端点: 挂载态恒为默认关; 乐观翻转 + 失败回滚 + toast,
//* 序号守卫防陈旧失败回滚盖掉最新操作 (SettingsView 对话风格同款管线, 交互语义全站一致).
import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { setExtensionNotify } from '../../api/ext'
import { toast } from '../../utils/toast'

export function ExtNotifyToggle({ name }: { name: string }): ReactElement
{
    const [enabled, setEnabled] = useState(false)
    //* 保存序号: 连续快速点按时只回滚"仍是最新一次"的失败保存, 陈旧失败静默让位.
    const saveSeqRef = useRef(0)

    const toggle = (): void =>
    {
        const prev = enabled
        const next = !enabled
        setEnabled(next)
        const seq = ++saveSeqRef.current
        void setExtensionNotify(name, next).catch(() =>
        {
            if(seq !== saveSeqRef.current)
                return  //* 陈旧失败: 最新一次操作已在其后落定, 回滚只会把 UI 翻离服务端事实.
            setEnabled(prev)
            toast(next ? '开启提醒失败, 请重试' : '关闭提醒失败, 请重试', 'error')
        })
    }

    return (
        <div className="ext-notify-row">
            <span className="ext-notify-label">开启提醒</span>
            {/* role=switch + aria-checked: 开关语义对读屏可感知; pressable 沿全站按压缩放惯例. */}
            <button type="button" className="ext-switch pressable" role="switch" aria-checked={enabled} aria-label="开启提醒" onClick={toggle}>
                <span className="ext-switch-knob" />
            </button>
        </div>
    )
}
