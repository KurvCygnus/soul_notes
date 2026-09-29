//* 输入区: 聊天/记一笔双态 + chips 快捷入口 + 语音转写回填 (多模态入口的文本侧终点).
//* 分层裁决: 访客门不在此层 — 无条件上抛 onSend(text, mode), 门由 useChatSend/ChatView 在接线处统一拦截,
//* 补发/补记等门语义只有一份实现 (状态机在 AuthContext), 输入组件保持纯输入.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { uploadVoice } from '../../api/diary'
import { toast } from '../../utils/toast'
import { MAX_RECORD_BYTES, MAX_RECORD_SECONDS, recordAudio, recordableSecondsLeft } from '../../utils/audio'
import type { IAudioRecording } from '../../utils/audio'

export type ComposerMode = 'chat' | 'diary'

export interface IComposerProps
{
    onSend(text: string, mode: ComposerMode): void
    //* 流式发送中由 ChatView 传 true 禁并发 (doSend 内的 abort 仅作兜底).
    disabled?: boolean
}

//* 占位语导出供测试锚定 (模式切换的可观察证据).
export const PLACEHOLDER_CHAT = '说说今天的心情, 或者随便聊点什么...'
export const PLACEHOLDER_DIARY = '记一笔今天的心情...'

const MAX_ROWS = 4

//* chips 快捷文案: 恒以聊天模式上抛 (即使当前处于记一笔态), 输入框内容不参与.
const CHIP_WEEK = '帮我看看这周的课和考试安排'
const CHIP_WEATHER = '我最近的心情天气怎么样?'

type VoiceState = 'idle' | 'recording' | 'transcribing'

export default function Composer({ onSend, disabled = false }: IComposerProps): ReactElement
{
    const [text, setText] = useState('')
    const [mode, setMode] = useState<ComposerMode>('chat')
    const [voice, setVoice] = useState<VoiceState>('idle')
    const [elapsed, setElapsed] = useState(0)
    const recordRef = useRef<IAudioRecording | null>(null)
    const diary = mode === 'diary'

    //* 统一发送口: 纯空白不发出; 记一笔提交后自动复位聊天模式 (一次性动作, 防下一条闲聊误入日记).
    const submit = useCallback((raw: string, sendMode: ComposerMode): void =>
    {
        const content = raw.trim()
        if(disabled || content === '')
            return
        onSend(content, sendMode)
        setText('')
        if(sendMode === 'diary')
            setMode('chat')
    }, [disabled, onSend])

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void =>
    {
        //! IME 防误发: 中文输入法合成期的回车用于候选确认 (isComposing / 部分实现上报 229), 不能当发送.
        if(e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
            return
        e.preventDefault()
        submit(e.currentTarget.value, mode)
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

    const rows = Math.min(MAX_ROWS, Math.max(1, text.split('\n').length))

    return (
        <div className={diary ? 'composer composer-diary' : 'composer'}>
            <textarea
                className="composer-textarea"
                aria-label="消息输入框"
                rows={rows}
                value={text}
                placeholder={diary ? PLACEHOLDER_DIARY : PLACEHOLDER_CHAT}
                disabled={disabled}
                onChange={(e) => { setText(e.target.value) }}
                onKeyDown={handleKeyDown}
            />
            <div className="composer-bar">
                <button
                    type="button"
                    className="composer-chip"
                    aria-pressed={diary}
                    disabled={disabled}
                    onClick={() => { setMode(m => m === 'diary' ? 'chat' : 'diary') }}
                >
                    ✍️ 记一笔
                </button>
                <button type="button" className="composer-chip" disabled={disabled} onClick={() => { submit(CHIP_WEEK, 'chat') }}>
                    📅 本周安排
                </button>
                <button type="button" className="composer-chip" disabled={disabled} onClick={() => { submit(CHIP_WEATHER, 'chat') }}>
                    ☀️ 心情天气
                </button>
                <span className="composer-spacer" />
                {voice === 'idle' && (
                    <button type="button" className="composer-mic" aria-label="语音输入" disabled={disabled} onClick={startVoice}>
                        🎙️
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
                <button type="button" className="btn btn-primary composer-send" disabled={disabled} onClick={() => { submit(text, mode) }}>
                    发送
                </button>
            </div>
        </div>
    )
}
