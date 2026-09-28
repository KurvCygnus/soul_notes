//* 登录/注册浮层: 协议强制勾选门禁 + 角色分流 (非 STUDENT 拒入并即时登出), 供访客门 shell (Task 9) 挂载.
//* 契约: <LoginSheet onAuthed onCancel /> — 成功进入只经 onAuthed, 本组件不直接触碰 AuthContext (分层裁决).
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent, ReactElement } from 'react'
import { login, logout, register } from '../../api/auth'
import { ApiError } from '../../api/http'
import { toast } from '../../utils/toast'
import { AGREEMENT } from './agreement'
import type { AuthData } from '../../types'

export interface ILoginSheetProps
{
    onAuthed(d: AuthData): void
    onCancel(): void
}

//region 局部样式 (取设计令牌变量内联, 不外溢 CSS 文件 — 同 toast.ts 裁决)

const PANEL_STYLE: CSSProperties = {
    width: 'min(420px, calc(100vw - 48px))',
    maxHeight: '90vh', overflowY: 'auto',
    padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px',
}

//* 协议全文滚动区: 限高保证浮层本体不超出视口, 全文在浮层内滚动 (锚点不导航离开).
const AGREEMENT_SCROLL_STYLE: CSSProperties = {
    maxHeight: '40vh', overflowY: 'auto',
    border: '1px solid var(--line)', borderRadius: 'var(--radius)',
    padding: '12px 16px', fontSize: '13px', lineHeight: 1.7,
}

const AGREEMENT_HEADING_STYLE: CSSProperties = { margin: '12px 0 4px', fontSize: '13px' }
const ROW_STYLE: CSSProperties = { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }

//endregion

export default function LoginSheet({ onAuthed, onCancel }: ILoginSheetProps): ReactElement
{
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [agreed, setAgreed] = useState(false)
    const [showAgreement, setShowAgreement] = useState(false)
    const [busy, setBusy] = useState(false)

    //* Escape 关闭: 挂 document 而非遮罩元素 — 浮层打开时焦点可能仍留在遮罩后方 (调用方未移交焦点),
    //* 遮罩内监听会漏按键; 以组件生命周期为界, 卸载即注销监听.
    useEffect(() =>
    {
        const onKey = (e: KeyboardEvent): void =>
        {
            if(e.key === 'Escape')
                onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onCancel])

    const isLogin = mode === 'login'
    const canSubmit = agreed && username.trim().length > 0 && password.length > 0 && !busy

    const submit = (e: FormEvent): void =>
    {
        e.preventDefault()
        if(!canSubmit)
            return
        setBusy(true)//* 防连点: 请求在途期间提交按钮同步禁用.
        const auth = isLogin ? login : register
        auth(username.trim(), password)
            .then(data =>
            {
                //* 角色分流: 咨询员等非学生账号不得进入学生端; login/register 已落盘, 必须登出清掉残留会话.
                if(data.role !== 'STUDENT')
                {
                    toast('请使用咨询员工作台', 'error')
                    logout()
                    return//* 不回调 onAuthed, 浮层保持打开等用户换账号.
                }
                onAuthed(data)
            })
            .catch((err: unknown) =>
            {
                //! 非预期异常 (非 ApiError) 没有 message 外壳, 兜底通用文案而非渲染 undefined.
                toast(err instanceof ApiError ? err.message : '登录失败, 请稍后重试', 'error')
            })
            .finally(() => setBusy(false))
    }

    //* 锚点链接只负责浮层内展开: preventDefault 阻止 hash 导航 (单页应用内禁止跳离当前页).
    const openAgreement = (e: MouseEvent<HTMLAnchorElement>): void =>
    {
        e.preventDefault()
        setShowAgreement(true)
    }

    return (
        //! 有意不做遮罩点击关闭: 遮罩误触会静默丢弃已输入的账密 (复审裁决), 关闭只走显式 取消/Escape.
        <div className="modal-overlay">
            <form
                className="card"
                style={PANEL_STYLE}
                onSubmit={submit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="login-sheet-title"
            >
                <h2 id="login-sheet-title" style={{ margin: 0, fontSize: '18px' }}>
                    {isLogin ? '登录心灵札记' : '注册新账号'}
                </h2>
                <label htmlFor="login-username">用户名</label>
                <input
                    id="login-username"
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                />
                <label htmlFor="login-password">密码</label>
                <input
                    id="login-password"
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <div style={ROW_STYLE}>
                    <label htmlFor="login-agreed">
                        <input
                            id="login-agreed"
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                        />
                        我已完整阅读并同意
                    </label>
                    <a href={`#${AGREEMENT.sections[0].id}`} onClick={openAgreement}>
                        《{AGREEMENT.title}》
                    </a>
                </div>
                {showAgreement && (
                    <div style={AGREEMENT_SCROLL_STYLE} aria-label="协议全文">
                        <strong>{AGREEMENT.title}</strong>
                        <p style={{ margin: '4px 0', color: 'var(--muted)' }}>{AGREEMENT.meta}</p>
                        {AGREEMENT.sections.map((s) => (
                            <section key={s.id} id={s.id}>
                                <h4 style={AGREEMENT_HEADING_STYLE}>{s.heading}</h4>
                                {s.paragraphs?.map((p) => <p key={p} style={{ margin: '0 0 4px' }}>{p}</p>)}
                                {s.points && (
                                    <ul style={{ margin: '0 0 4px', paddingLeft: '20px' }}>
                                        {s.points.map((p) => <li key={p}>{p}</li>)}
                                    </ul>
                                )}
                            </section>
                        ))}
                    </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                    {isLogin ? '登录' : '注册'}
                </button>
                <div style={ROW_STYLE}>
                    <button type="button" className="btn btn-sm" onClick={onCancel}>取消</button>
                    <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => { setMode(isLogin ? 'register' : 'login') }}
                    >
                        {isLogin ? '切换注册' : '切换登录'}
                    </button>
                </div>
            </form>
        </div>
    )
}
