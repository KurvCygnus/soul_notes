//* 输入区 (homepage-v2 Task 9 重构): 单一聊天模式 + chips 插槽 + 语音转写回填 (多模态入口的文本侧终点).
//* 记一笔双态已移除 (D16): 日记域入口退场后 Composer 回归纯输入, 琥珀态/占位语切换随之消失.
//* 分层裁决: 访客门不在此层收口文本发送 — onSend 无条件上抛, 门由 useChatSend 在接线处统一拦截 (requireAuth
//* 包 doSend, 登录后补发). chips 是唯一例外: 访客 (onRequireLogin 在场) 点击只上抛开门且不直发 —
//* 手输文本可补发是因为它是用户亲手写的, chip 只是候选题面, 登录后不应替用户发出未确认的提问.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { uploadVoice } from '../../api/voice'
import { toast } from '../../utils/toast'
import { growTextarea } from '../../utils/autogrow'
import { MAX_RECORD_BYTES, MAX_RECORD_SECONDS, recordAudio, recordableSecondsLeft } from '../../utils/audio'
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
}

//* 占位语导出供测试锚定 (单一聊天模式的可观察证据).
export const PLACEHOLDER_CHAT = '说说今天的心情, 或者随便聊点什么...'

type VoiceState = 'idle' | 'recording' | 'transcribing'

export default function Composer({ onSend, disabled = false, chips, onRequireLogin }: IComposerProps): ReactElement
{
    const [text, setText] = useState('')
    const [voice, setVoice] = useState<VoiceState>('idle')
    const [elapsed, setElapsed] = useState(0)
    const recordRef = useRef<IAudioRecording | null>(null)

    //* 统一发送口: 纯空白不发出 (与 chips 直发同门).
    const submit = useCallback((raw: string): void =>
    {
        const content = raw.trim()
        if(disabled || content === '')
            return
        onSend(content)
        setText('')
    }, [disabled, onSend])

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
            catch(() => toast('无法访问麦克风, 请检查浏览器授权.', 'error'))
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
                        setText(prev => prev === '' ? transcribed : `${prev}\n${transcribed}`)
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
    }, [])

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

    //* 自增高 (评审整改): 文本变化即随内容拉伸, 上限由 CSS max-height 约束; 发送清空后同样收缩回弹.
    const textRef = useRef<HTMLTextAreaElement | null>(null)
    useEffect(() =>
    {
        if(textRef.current != null)
            growTextarea(textRef.current)
    }, [text])

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
                    onChange={(e) => { setText(e.target.value) }}
                    onKeyDown={handleKeyDown}
                />
                <div className="composer-bar">
                    <span className="composer-spacer" />
                    {voice === 'idle' && (
                        <button type="button" className="composer-mic" aria-label="语音输入" disabled={disabled} onClick={startVoice}>
                            <Icon name="mic" size={16} />
                        </button>
                    )}
                    {voice === 'recording' && (
                        <span className="composer-rec" role="status">
                            <span className="composer-rec-dot" aria-hidden="true" />
                            {`已录 ${elapsed}s · 还可录 ${recordableSecondsLeft(elapsed)}s`}
                            <button type="button" className="composer-stop" onClick={stopVoice}>停止</button>
                        </span>
                    )}
                    {voice === 'transcribing' && <span className="composer-rec" role="status">转写中...</span>}
                    <button type="button" className="composer-send" aria-label="发送" disabled={disabled || text.trim() === ''} onClick={() => { submit(text) }}>
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
                            className="composer-chip"
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
