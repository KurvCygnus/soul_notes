//* 设置页: 主题 (雾杉/暮蓝) + 外观 (跟随系统/浅色/深色) 双分段控件 + 对话风格五轴 (Task 3) + 显示字号步进器 (Task 4).
//* 主题/外观只经 [[applyTheme]]/[[getStoredTheme]]/[[getStoredMode]] 切换; 对话风格只经 [[api/chatStyle]] 读写
//* (点选即乐观 PUT, 失败回滚); 字号只经 [[utils/chatFont]] 读写 — 各域持久化不脱节 (与 index.html 早脚本同键名同回退语义).
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { applyTheme, getStoredMode, getStoredTheme } from '../utils/theme'
import type { ModeName, ThemeName } from '../utils/theme'
import { getChatStyle, putChatStyle } from '../api/chatStyle'
import { toast } from '../utils/toast'
import { applyChatFont, getStoredChatFont, MAX_CHAT_FONT, MIN_CHAT_FONT } from '../utils/chatFont'
import type { ChatStyleName, ChatStyleTrio, ChatStyleVo } from '../types'

//* 主题二选一: 展示名与 ThemeName 的固定映射 (雾杉 = 默认, 暮蓝 = 备选).
const THEME_OPTIONS: ReadonlyArray<{ name: ThemeName; label: string }> = [
    { name: 'sage', label: '雾杉' },
    { name: 'dusk', label: '暮蓝' },
]

//* 外观三档: system = 跟随系统 (默认, main.tsx 全局订阅实时跟随 OS 切换), light/dark = 手动固定.
const MODE_OPTIONS: ReadonlyArray<{ name: ModeName; label: string }> = [
    { name: 'system', label: '跟随系统' },
    { name: 'light', label: '浅色' },
    { name: 'dark', label: '深色' },
]

//* 基础风格七选一: 展示名与档位标识的固定映射, 顺序即后端值域声明序 (默认 = 全默认回显档).
const STYLE_OPTIONS: ReadonlyArray<{ name: ChatStyleName; label: string }> = [
    { name: 'default', label: '默认' },
    { name: 'professional', label: '专业可靠' },
    { name: 'friendly', label: '亲和友善' },
    { name: 'direct', label: '直率乐观' },
    { name: 'optimist', label: '天马行空' },
    { name: 'pragmatic', label: '高效务实' },
    { name: 'witty', label: '吐槽达人' },
]

//* 三态轴档: 减弱/默认/增强, 四轴共用一组档位.
const TRIO_OPTIONS: ReadonlyArray<{ name: ChatStyleTrio; label: string }> = [
    { name: 'less', label: '减弱' },
    { name: 'default', label: '默认' },
    { name: 'more', label: '增强' },
]

//* 四轴渲染序: key 必须落在四轴字段内 (style 不在此列, 由基础风格组承接).
type ChatStyleAxisKey = Exclude<keyof ChatStyleVo, 'style'>

const AXIS_OPTIONS: ReadonlyArray<{ key: ChatStyleAxisKey; label: string }> = [
    { key: 'warmth', label: '亲切程度' },
    { key: 'enthusiasm', label: '热情程度' },
    { key: 'headings', label: '标题和列表' },
    { key: 'emoji', label: '表情符号' },
]

//* 全默认五轴: 初态与 GET 失败回显共用 (契约: 失败也回显默认而非空转).
const DEFAULT_CHAT_STYLE: ChatStyleVo = { style: 'default', warmth: 'default', enthusiasm: 'default', headings: 'default', emoji: 'default' }

export default function SettingsView(): ReactElement
{
    const [theme, setTheme] = useState<ThemeName>(getStoredTheme)
    const [mode, setMode] = useState<ModeName>(getStoredMode)
    const [prefs, setPrefs] = useState<ChatStyleVo>(DEFAULT_CHAT_STYLE)
    const [chatFont, setChatFont] = useState<number>(getStoredChatFont)

    //* 用户是否已抢先操作对话风格: GET 慢响应回灌会盖掉乐观点选, 触碰过即拒收快照.
    const styleTouchedRef = useRef(false)
    //* 保存序号: 连续快速点选时只回滚"仍是最新一次"的失败保存, 旧失败不得用旧快照盖掉新选择.
    const saveSeqRef = useRef(0)

    //* 应用唯一路径: 选择只改 React 态, effect 统一走 [[applyTheme]] — 挂载对齐 (深链兜底) 与即时切换共用一条管线;
    //* system 档的 OS 实时跟随不在组件内订阅 (main.tsx 全局订阅已覆盖), 组件只负责表达与持久化当前偏好.
    useEffect(() => { applyTheme(theme, mode) }, [theme, mode])

    //* 字号挂载对齐 + 变更即生效 (与主题同构的 effect 管线): 挂载把存储值落成 --fs-chat 内联令牌
    //* (main.tsx 已先行恢复过的场景为幂等空转), 步进后同步持久化 — 双写收口在 [[applyChatFont]].
    useEffect(() => { applyChatFont(chatFont) }, [chatFont])

    //* 回显服务端偏好 (挂载一次): 失败不阻断页面 — 保持全默认回显并 toast (设置页永不因网络白屏);
    //* 已触顶于用户点选时拒收快照, 防止慢响应盖掉乐观更新.
    useEffect(() =>
    {
        let alive = true
        getChatStyle().then(
            vo =>
            {
                if(alive && !styleTouchedRef.current && vo != null)
                    setPrefs(vo)
            },
            () =>
            {
                if(alive)
                    toast('风格设置加载失败', 'error')
            },
        )
        return () => { alive = false }
    }, [])

    //* 乐观保存: 先落本地态再上送, 失败回滚快照 + toast; 序号守卫保证只有最新一次保存的失败才回滚.
    const savePrefs = (next: ChatStyleVo): void =>
    {
        const prev = prefs
        setPrefs(next)
        styleTouchedRef.current = true
        const seq = ++saveSeqRef.current
        void putChatStyle(next).catch(() =>
        {
            if(seq !== saveSeqRef.current)
                return
            setPrefs(prev)
            toast('保存失败, 请重试', 'error')
        })
    }

    //* 三态轴统一点选入口: 四轴字段同型 (ChatStyleTrio), 展开后按联合键写值合法 — 免四份同构 handler.
    const saveAxis = (key: ChatStyleAxisKey, value: ChatStyleTrio): void =>
    {
        const next = { ...prefs }
        next[key] = value
        savePrefs(next)
    }

    //* 字号步进: 越界请求夹回值域, 边界禁用态由渲染层按值域判定 (双保险).
    const stepChatFont = (delta: number): void =>
    {
        setChatFont(current => Math.min(MAX_CHAT_FONT, Math.max(MIN_CHAT_FONT, current + delta)))
    }

    return (
        <div className="settings-view">
            <header className="view-header">
                <h1>设置</h1>
            </header>
            <section className="card settings-card" aria-label="主题">
                <h2 className="settings-card-title">主题</h2>
                <div className="settings-theme" role="group" aria-label="主题选择">
                    {/* aria-pressed 即选中态: 分段控件以按压语义替代单选组, 读屏可感知当前选项. */}
                    {THEME_OPTIONS.map(opt => (
                        <button
                            key={opt.name}
                            type="button"
                            className="settings-theme-opt"
                            aria-pressed={theme === opt.name}
                            onClick={() => setTheme(opt.name)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <p className="settings-hint">切换即时生效并自动记住, 下次打开沿用所选主题.</p>
            </section>
            <section className="card settings-card" aria-label="外观">
                <h2 className="settings-card-title">外观</h2>
                <div className="settings-theme" role="group" aria-label="外观选择">
                    {MODE_OPTIONS.map(opt => (
                        <button
                            key={opt.name}
                            type="button"
                            className="settings-theme-opt"
                            aria-pressed={mode === opt.name}
                            onClick={() => setMode(opt.name)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <p className="settings-hint">跟随系统时明暗随操作系统实时切换, 手动选择则固定使用所选模式.</p>
            </section>
            <section className="card settings-card" aria-label="对话风格">
                <h2 className="settings-card-title">对话风格</h2>
                <div className="settings-style" role="group" aria-label="基础风格选择">
                    {/* aria-pressed 即选中态 (与主题分段同语义); 7 段窄屏换行, 样式裁定见 base.css .settings-style. */}
                    {STYLE_OPTIONS.map(opt => (
                        <button
                            key={opt.name}
                            type="button"
                            className="settings-style-opt"
                            aria-pressed={prefs.style === opt.name}
                            onClick={() => savePrefs({ ...prefs, style: opt.name })}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {AXIS_OPTIONS.map(axis => (
                    <div key={axis.key} className="settings-axis-row">
                        <span className="settings-axis-name">{axis.label}</span>
                        <div className="settings-theme" role="group" aria-label={axis.label}>
                            {TRIO_OPTIONS.map(opt => (
                                <button
                                    key={opt.name}
                                    type="button"
                                    className="settings-theme-opt"
                                    aria-pressed={prefs[axis.key] === opt.name}
                                    onClick={() => saveAxis(axis.key, opt.name)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                <p className="settings-hint">仅影响倾听者回复的措辞与格式, 安全守护不受影响.</p>
            </section>
            <section className="card settings-card" aria-label="显示">
                <h2 className="settings-card-title">显示</h2>
                <div className="settings-axis-row">
                    <span className="settings-axis-name">字体大小</span>
                    <div className="settings-stepper" role="group" aria-label="字体大小">
                        <button
                            type="button"
                            className="settings-stepper-opt"
                            aria-label="减小字体"
                            disabled={chatFont <= MIN_CHAT_FONT}
                            onClick={() => stepChatFont(-1)}
                        >
                            -
                        </button>
                        <span className="settings-stepper-value">{chatFont}px</span>
                        <button
                            type="button"
                            className="settings-stepper-opt"
                            aria-label="增大字体"
                            disabled={chatFont >= MAX_CHAT_FONT}
                            onClick={() => stepChatFont(1)}
                        >
                            +
                        </button>
                    </div>
                </div>
                <p className="settings-hint">调整聊天正文字号, 即时生效并自动记住.</p>
            </section>
            <section className="card settings-card" aria-label="关于">
                <h2 className="settings-card-title">关于</h2>
                <p className="settings-hint">
                    心灵札记 v1.5.0 — 面向大学生的多模态情绪陪伴与心理轻干预工具: 倾听与记录, 不贴标签, 不做医疗诊断.
                </p>
            </section>
        </div>
    )
}
