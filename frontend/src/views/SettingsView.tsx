//* 设置页 (spec §4.2): 主题选择 雾杉/暮蓝 二选一分段控件 — 只经 [[applyTheme]]/[[getStoredTheme]] 切换,
//* 保证 <html data-theme> 与 localStorage 持久化不脱节 (与 index.html 早脚本同键名同回退语义, D24).
//* 挂载即对齐一次存储值: 深链/直接导航进入时早脚本可能未接管, 对齐兜底双端一致; 其余设置项未定稿, 留建设中空态.
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { applyTheme, getStoredTheme } from '../utils/theme'
import type { ThemeName } from '../utils/theme'

//* 主题二选一: 展示名与 ThemeName 的固定映射 (雾杉 = 默认, 暮蓝 = 备选).
const THEME_OPTIONS: ReadonlyArray<{ name: ThemeName; label: string }> = [
    { name: 'sage', label: '雾杉' },
    { name: 'dusk', label: '暮蓝' },
]

export default function SettingsView(): ReactElement
{
    const [theme, setTheme] = useState<ThemeName>(getStoredTheme)

    //* 应用唯一路径: 选择只改 React 态, effect 统一走 [[applyTheme]] — 挂载对齐 (深链兜底) 与即时切换共用一条管线.
    useEffect(() => { applyTheme(theme) }, [theme])

    return (
        <div className="settings-view">
            <header className="view-header">
                <h1>设置</h1>
            </header>
            <section className="card settings-card" aria-label="外观">
                <h2 className="settings-card-title">主题</h2>
                <div className="settings-theme" role="group" aria-label="主题选择">
                    {/* aria-pressed 即选中态: 二选一控件以按压语义替代单选组, 读屏可感知当前主题. */}
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
            <section className="card settings-card" aria-label="更多设置">
                <h2 className="settings-card-title">更多设置</h2>
                <p className="view-empty">建设中</p>
            </section>
        </div>
    )
}
