//* 设置页 (定稿): 主题 (雾杉/暮蓝) + 外观 (跟随系统/浅色/深色) 双分段控件 — 只经 [[applyTheme]]/[[getStoredTheme]]/
//* [[getStoredMode]] 切换, 保证 <html data-theme data-mode> 与 localStorage 持久化不脱节 (与 index.html 早脚本同键名同回退语义).
//* 页面已定稿: 除版本信息 (关于卡) 外不设其他条目, 无"建设中"占位 — 新设置项须先过需求定稿再加.
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { applyTheme, getStoredMode, getStoredTheme } from '../utils/theme'
import type { ModeName, ThemeName } from '../utils/theme'

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

export default function SettingsView(): ReactElement
{
    const [theme, setTheme] = useState<ThemeName>(getStoredTheme)
    const [mode, setMode] = useState<ModeName>(getStoredMode)

    //* 应用唯一路径: 选择只改 React 态, effect 统一走 [[applyTheme]] — 挂载对齐 (深链兜底) 与即时切换共用一条管线;
    //* system 档的 OS 实时跟随不在组件内订阅 (main.tsx 全局订阅已覆盖), 组件只负责表达与持久化当前偏好.
    useEffect(() => { applyTheme(theme, mode) }, [theme, mode])

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
            <section className="card settings-card" aria-label="关于">
                <h2 className="settings-card-title">关于</h2>
                <p className="settings-hint">
                    心灵札记 v1.5.0 — 面向大学生的多模态情绪陪伴与心理轻干预工具: 倾听与记录, 不贴标签, 不做医疗诊断.
                </p>
            </section>
        </div>
    )
}
