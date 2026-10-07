//* 登录/注册浮层: 协议强制勾选门禁 + 角色分流 (COUNSELOR 拒入并即时登出; ADMIN 放行 — C1 双裁定,
//* 登录后的落地直达工作台由路由层承接), 供访客门 shell (Task 9) 挂载.
//* 契约: <LoginSheet open onAuthed onCancel /> — 成功进入只经 onAuthed, 本组件不直接触碰 AuthContext (分层裁决).
//* 常驻挂载 + open 短路 (走查裁决 2026-10-03): 退场动画经 useExitAnimation 簿记, 焦点陷阱罩住 Tab 循环.
import { useEffect, useRef, useState } from 'react'
import type { AnimationEvent, CSSProperties, FormEvent, MouseEvent, ReactElement } from 'react'
import { login, logout, register } from '../../api/auth'
import { ApiError } from '../../api/http'
import { toast } from '../../utils/toast'
import { useBrandName } from '../../hooks/useBrandName'
import { useExitAnimation } from '../../hooks/useExitAnimation'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { AGREEMENT } from './agreement'
import type { AuthData } from '../../types'

export interface ILoginSheetProps
{
    open: boolean
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

export default function LoginSheet({ open, onAuthed, onCancel }: ILoginSheetProps): ReactElement | null
{
    const { mounted, closing, markExited } = useExitAnimation(open)
    const rootRef = useRef<HTMLDivElement>(null)
    useFocusTrap(rootRef, open && !closing)
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [agreed, setAgreed] = useState(false)
    const [showAgreement, setShowAgreement] = useState(false)
    const [busy, setBusy] = useState(false)

    //* Escape 关闭: 仅 open 态挂 document 级监听 — 浮层打开时焦点可能仍留在遮罩后方 (调用方未移交焦点),
    //* 遮罩内监听会漏按键; 退场期不再响应 (onCancel 已消费, 重复上抛无意义).
    useEffect(() =>
    {
        if(!open)
            return
        const onKey = (e: KeyboardEvent): void =>
        {
            if(e.key === 'Escape')
                onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, onCancel])

    const onExitAnimationEnd = (e: AnimationEvent<HTMLDivElement>): void =>
    {
        if(closing && e.target === e.currentTarget && e.animationName === 'overlay-exit')
            markExited()
    }

    const isLogin = mode === 'login'
    //* 品牌域接线 (评审整改): 浮层标题消费后端品牌配置, 不再硬编码产品名 (形状升级: 品牌域快照解构取 brand).
    const { brand } = useBrandName()
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
                //* 角色分流 (C1 双裁定): 咨询员账号不得进入学生端; ADMIN 已放行 (聊天位对 ADMIN 的落地
                //* 重定向归路由层, 本组件不做导航). login/register 已落盘, 拒入分支必须登出清掉残留会话.
                if(data.role !== 'STUDENT' && data.role !== 'ADMIN')
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

    if(!mounted)
        return null

    return (
        //! 有意不做遮罩点击关闭: 遮罩误触会静默丢弃已输入的账密 (复审裁决), 关闭只走显式 取消/Escape.
        <div ref={rootRef} className={`modal-overlay${closing ? ' closing' : ''}`} onAnimationEnd={onExitAnimationEnd}>
            <form
                className="card anim-pop"  //* anim-pop (Task 13): 浮层家族同款入场淡入 + 0.97 缩放 (spec §9.1).
                style={PANEL_STYLE}
                onSubmit={submit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="login-sheet-title"
            >
                <h2 id="login-sheet-title" style={{ margin: 0, fontSize: '18px' }}>
                    {isLogin ? `登录${brand}` : '注册新账号'}
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
