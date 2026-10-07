//* 输入区 (homepage-v2 Task 9 重构): 单一聊天模式 + chips 插槽 + 语音转写回填 (多模态入口的文本侧终点).
//* 记一笔双态已移除 (D16): 日记域入口退场后 Composer 回归纯输入, 琥珀态/占位语切换随之消失.
//* 分层裁决: 访客门不在此层收口文本发送 — onSend 无条件上抛, 门由 useChatSend 在接线处统一拦截 (requireAuth
//* 包 doSend, 登录后补发). chips 是唯一例外: 访客 (onRequireLogin 在场) 点击只上抛开门且不直发 —
//* 手输文本可补发是因为它是用户亲手写的, chip 只是候选题面, 登录后不应替用户发出未确认的提问.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { uploadVoice } from '../../api/voice'
import { toast } from '../../utils/toast'
import { growTextarea } from '../../utils/autogrow'
import { MAX_RECORD_BYTES, MAX_RECORD_SECONDS, micAccessErrorMessage, recordAudio, recordableSecondsLeft } from '../../utils/audio'
import type { IAudioRecording } from '../../utils/audio'
import type { IHomeChip } from '../../extensions/types'
import Icon from '../ui/Icon'

export interface IComposerProps
{
    onSend(text: string): void
    //* 流式发送中由 ChatView 传 true 禁并发 (doSend 内的 abort 仅作兜底).
    disabled?: boolean
    //* chips 插槽 (D25): ChatView 经 selectVisibleChips 注入, 组件不感知注册表.
    chips: IHomeChip[]
    //* 访客门 (壳在访客态提供): chips 点击先过门, 不直发; 缺省 = 登录态, chips 直发.
    onRequireLogin?(): void
    //* 每会话草稿 (R3+): 外部草稿源 (ChatView 按 activeSessionId 换发) + 回写通道.
    //* 侵入最小方案裁定: 本组件文本仍是内部 state (非受控), draft 仅作"会话切换回灌源" —
    //* 引用变化即整体覆写; 击键回环时同值命中自动跳过, 不打断输入. 两 prop 均缺省时行为与旧单态完全一致.
    draft?: string
    onDraftChange?(text: string): void
}

//* 占位语导出供测试锚定 (单一聊天模式的可观察证据).
export const PLACEHOLDER_CHAT = '说说今天的心情, 或者随便聊点什么...'

type VoiceState = 'idle' | 'recording' | 'transcribing'

export default function Composer({ onSend, disabled = false, chips, onRequireLogin, draft, onDraftChange }: IComposerProps): ReactElement
{
    const [text, setText] = useState(draft ?? '')
    const [voice, setVoice] = useState<VoiceState>('idle')
    const [elapsed, setElapsed] = useState(0)
    const recordRef = useRef<IAudioRecording | null>(null)

    //* 文本镜像: 与 text 严格同步 (唯一写入口 updateText 与回灌两处共写), 供两处消费 —
    //* 会话切换回灌做同值短路; 语音回填取"当前全文"拼接 (不在 setState 函数式更新器里做上抛副作用,
    //! StrictMode 双调用更新器会让 onDraftChange 重复触发).
    const textMirrorRef = useRef(text)

    //* 会话切换回灌 (R3+): 外部草稿源引用变化即整体覆写内部态 — 击键回环 (updateText 已同步镜像) 同值命中
    //* 即跳过, 只有切换会话/发送清空等真正换值的时刻才写.
    useEffect(() =>
    {
        if(draft != null && draft !== textMirrorRef.current)
        {
            textMirrorRef.current = draft
            setText(draft)
        }
    }, [draft])

    //* 唯一写入口: 内部态 + 镜像 + 草稿上抛三处同步 (输入/发送清空/语音回填共用).
    const updateText = useCallback((next: string): void =>
    {
        textMirrorRef.current = next
        setText(next)
        onDraftChange?.(next)
    }, [onDraftChange])

    //* 统一发送口: 纯空白不发出 (与 chips 直发同门).
    const submit = useCallback((raw: string): void =>
    {
        const content = raw.trim()
        if(disabled || content === '')
            return
        //* 先清后发 (R3+ 裁定): 清空必须落在 onSend 之前 — 新会话发送时 meta 绑定会在 onSend 内把
        //* sessionIdRef 从 null 换成实际会话 ID, 后清会让草稿台账错记到新键上, null 键残留已发送内容,
        //* 下次"新对话"会把它当草稿恢复. 先清则台账按发送前的键 (null) 落定; 访客门拦截场景输入本就清空
        //* 等待补发 (既有契约), 语义一致.
        updateText('')
        onSend(content)
    }, [disabled, onSend, updateText])

    //* chips 点击 (D25): 访客先过门且不直发 (见文件头裁决), 登录态直接以完整问题直发.
    const handleChip = useCallback((chip: IHomeChip): void =>
    {
        if(disabled)
            return
        if(onRequireLogin != null)
        {
            onRequireLogin()
            return
        }
        submit(chip.question)
    }, [disabled, onRequireLogin, submit])

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void =>
    {
        //! IME 防误发: 中文输入法合成期的回车用于候选确认 (isComposing / 部分实现上报 229), 不能当发送.
        if(e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
            return
        e.preventDefault()
        submit(e.currentTarget.value)
    }

    const startVoice = (): void =>
    {
        if(disabled || voice !== 'idle')
            return
        recordAudio().
            then(handle =>
            {
                recordRef.current = handle
                setElapsed(0)
                setVoice('recording')
            }).
            catch((e: unknown) => toast(micAccessErrorMessage(e), 'error'))  //* Task 15: 按 getUserMedia 错误 name 分流文案 (分流纯函数在 [[audio]]).
    }

    const stopVoice = useCallback((): void =>
    {
        const handle = recordRef.current
        if(handle == null)
            return
        recordRef.current = null
        setVoice('transcribing')
        handle.stop().
            then(blob =>
            {
                if(blob.size > MAX_RECORD_BYTES)  //! 7MB 前端拦截: 不发起必然被后端拒绝的上传.
                {
                    toast('这段录音太长了, 请分几段慢慢说.', 'error')
                    setVoice('idle')
                    return
                }
                return uploadVoice(blob).then(res =>
                {
                    const transcribed = res.transcribedText
                    if(res.status === 'TRANSCRIBED' && transcribed != null)
                    {
                        //* 回填而非自动发送: 转写常有错字, 先让用户审阅编辑再自己按发送 (产品裁决).
                        const base = textMirrorRef.current
                        updateText(base === '' ? transcribed : `${base}\n${transcribed}`)
                        setVoice('idle')
                    }
                    else
                    {
                        toast(res.message ?? '没能听清这段语音, 请再试一次.', 'error')
                        setVoice('idle')
                    }
                })
            }).
            catch(() =>
            {
                toast('语音没能转成文字, 请再试一次.', 'error')
                setVoice('idle')
            })
    }, [updateText])

    //* 录音计时: 秒级轮询足够 (提示按码率换算剩余可录时长, 精度无需更高).
    useEffect(() =>
    {
        if(voice !== 'recording')
            return
        const timer = setInterval(() => { setElapsed(s => s + 1) }, 1000)
        return () => { clearInterval(timer) }
    }, [voice])

    //* 60s 硬顶的 UI 侧收束: recordAudio 内部另有定时器兜底, 双保险谁先到谁触发 (finish 幂等).
    useEffect(() =>
    {
        if(voice === 'recording' && elapsed >= MAX_RECORD_SECONDS)
            stopVoice()
    }, [voice, elapsed, stopVoice])

    useEffect(() => () =>
    {
        //* 录音中卸载: 强制收束释放麦克风, 返回的 Blob 已无人消费, 拒绝静默吞掉.
        void recordRef.current?.stop().catch(() => {})
    }, [])

    //* 自增高复位口唯一化 (真机缺陷整改): 高度对账不挂任何依赖 — 每次提交都按 DOM 实况重算一次.
    //! 旧实现挂 [text], 但高度几何跟随的是 DOM 实况内容: 浏览器表单恢复/IME 合成边缘等绕开 React state
    //! 的 DOM 写入一旦发生, text 不再变化就永无对账机会 (真机实锤: 空值输入框滞留大高度, 500 字发送
    //! 轨迹后可见). 唯一复位口 = 本处: 发送清空/切会话草稿回灌/外部脱钩全部在此按当前实况收敛,
    //! 空内容回落单行基高 (growTextarea 空实况交还 CSS min-height); 布局期执行避免恢复类场景闪一帧旧高度.
    const textRef = useRef<HTMLTextAreaElement | null>(null)
    useLayoutEffect(() =>
    {
        if(textRef.current != null)
            growTextarea(textRef.current)
    })

    //* 结构裁决 (走查指令): chips 在对话框卡片外面的下方一行, 卡片内只留输入与发送.
    return (
        <div className="composer-wrap">
            <div className='composer'>
                <textarea
                    ref={textRef}
                    className="composer-textarea"
                    aria-label="消息输入框"
                    rows={1}
                    value={text}
                    placeholder={PLACEHOLDER_CHAT}
                    disabled={disabled}
                    onChange={(e) => { updateText(e.target.value) }}
                    onKeyDown={handleKeyDown}
                />
                <div className="composer-bar">
                    <span className="composer-spacer" />
                    {voice === 'idle' && (
                        <button type="button" className="composer-mic pressable" aria-label="语音输入" disabled={disabled} onClick={startVoice}>
                            <Icon name="mic" size={16} />
                        </button>
                    )}
                    {voice === 'recording' && (
                        <span className="composer-rec" role="status">
                            <span className="composer-rec-dot" aria-hidden="true" />
                            {`已录 ${elapsed}s · 还可录 ${recordableSecondsLeft(elapsed)}s`}
                            <button type="button" className="composer-stop pressable" onClick={stopVoice}>停止</button>
                        </span>
                    )}
                    {voice === 'transcribing' && <span className="composer-rec" role="status">转写中...</span>}
                    <button type="button" className="composer-send pressable" aria-label="发送" disabled={disabled || text.trim() === ''} onClick={() => { submit(text) }}>
                        <Icon name="arrow-up" size={18} />
                    </button>
                </div>
            </div>
            {chips.length > 0 && (
                <div className="composer-chips">
                    {chips.map(chip => (
                        <button
                            key={chip.label}
                            type="button"
                            className="composer-chip pressable"
                            disabled={disabled}
                            onClick={() => { handleChip(chip) }}
                        >
                            <span>{chip.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
