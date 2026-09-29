//* 语音录制域: WAV 编码纯函数 + 浏览器录音链路 (MediaRecorder 采集 → AudioContext 解码重采样 → 16k 单声道 PCM16 WAV).
//* 后端契约红线: /voice/upload 仅接受 16kHz 单声道 PCM16 WAV (RIFF 头硬校验, 非 WAV 落盘前即拒绝),
//* 故 stop() 产物必须经 [[encodeWav]] 落到该格式, 浏览器原生编码 (webm/opus 等) 不可直接上传.

//region 常量与纯函数

//* 后端 ASR 引擎的固定输入采样率, 与后端解析器同源.
export const WAV_SAMPLE_RATE = 16000

//* 标准 44 字节 RIFF/WAVE 头 (PCM 无扩展块).
export const WAV_HEADER_BYTES = 44

//* 录音时长硬顶 60s: 兼顾转写延迟与存储, 同时使 PCM16 体积上限 = 60 * 32000 ≈ 1.92MB, 远低于上传闸 7MB.
export const MAX_RECORD_SECONDS = 60

//* 上传前体积闸 (前端拦截): 按当前码率 60s 仅 ~1.92MB, 7MB 为防御性余量 (未来提码率/加声道也不触后端 10MB 硬顶).
export const MAX_RECORD_BYTES = 7 * 1024 * 1024

//* WAV 码率 (字节/秒) = 16k 采样 * 2 字节 * 单声道, 剩余可录提示据此换算.
const WAV_BYTE_RATE = WAV_SAMPLE_RATE * 2

//* RIFF/WAVE 编码: 44 字节头 + 16bit PCM 单声道小端; 样本钳制到 [-1, 1] 后量化 (越界不溢出翻转).
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer
{
    const dataLength = samples.length * 2
    const wav = new ArrayBuffer(WAV_HEADER_BYTES + dataLength)
    const view = new DataView(wav)
    writeAscii(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataLength, true)   //* RIFF 块长 = 头其余部分 + 数据
    writeAscii(view, 8, 'WAVE')
    writeAscii(view, 12, 'fmt ')
    view.setUint32(16, 16, true)               //* fmt 块长 (PCM 固定 16)
    view.setUint16(20, 1, true)                //* audioFormat = PCM
    view.setUint16(22, 1, true)                //* 单声道
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)   //* byteRate = 采样率 * 声道 * 2 字节
    view.setUint16(32, 2, true)                //* blockAlign = 声道 * 2 字节
    view.setUint16(34, 16, true)               //* 位深
    writeAscii(view, 36, 'data')
    view.setUint32(40, dataLength, true)
    for(let i = 0; i < samples.length; i++)
    {
        const s = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(WAV_HEADER_BYTES + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    return wav
}

//* 按码率估算剩余可录秒数: 60s 时长顶与 7MB 容量顶取更小者, 超限归零不出现负数 (纯函数, 供录制提示复用).
export function recordableSecondsLeft(elapsedSeconds: number): number
{
    const byDuration = MAX_RECORD_SECONDS - elapsedSeconds
    const byCapacity = Math.floor(MAX_RECORD_BYTES / WAV_BYTE_RATE) - elapsedSeconds
    return Math.max(0, Math.min(byDuration, byCapacity))
}

function writeAscii(view: DataView, offset: number, text: string): void
{
    for(let i = 0; i < text.length; i++)
        view.setUint8(offset + i, text.charCodeAt(i))
}

//endregion

//region 录音控制

export interface IAudioRecording
{
    //* 幂等: 内部 60s 硬顶自动触发与用户手动停止竞争时, 返回同一份 WAV 的同一个 Promise.
    stop(): Promise<Blob>
}

//* 挑浏览器支持的录音容器: opus(webm) 优先 (体积小), mp4 兜 Safari; 都不支持则交由浏览器默认.
function pickRecorderMime(): string | undefined
{
    for(const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'])
    {
        if(MediaRecorder.isTypeSupported(mime))
            return mime
    }
    return undefined
}

//* 开始录音: 申请麦克风 (无授权/无设备直接拒绝, 由调用方提示), 到 60s 自动收束.
//* stop() 链路: 原生编码容器 → decodeAudioData 解 PCM → OfflineAudioContext 固定 16k 单声道重采样 → [[encodeWav]].
export async function recordAudio(): Promise<IAudioRecording>
{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: pickRecorderMime() })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e: BlobEvent) =>
    {
        if(e.data.size > 0)
            chunks.push(e.data)
    }
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    recorder.start()

    let finished = false  //* 幂等闩锁: 自动硬顶与手动 stop 竞争只收束一次.
    let resolveBlob!: (blob: Blob) => void
    let rejectBlob!: (reason: unknown) => void
    const done = new Promise<Blob>((resolve, reject) =>
    {
        resolveBlob = resolve
        rejectBlob = reject
    })

    async function finish(): Promise<void>
    {
        if(finished)
            return
        finished = true
        clearTimeout(capTimer)
        try
        {
            recorder.stop()
            await stopped
            stream.getTracks().forEach(track => track.stop())  //* 无论成败都释放麦克风.
            if(chunks.length === 0)
                throw new Error('NO_AUDIO')  //! 即点即停/麦克风静默: 无数据可编码, 快速失败让调用方提示重试.
            const raw = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()
            //* 解码容器用原生采样率的临时上下文 (decodeAudioData 只负责解出 PCM), 重采样交给固定 16k 的离线上下文.
            const decodeCtx = new AudioContext()
            try
            {
                const decoded = await decodeCtx.decodeAudioData(raw)
                const frames = Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE))
                const offline = new OfflineAudioContext(1, frames, WAV_SAMPLE_RATE)
                const source = offline.createBufferSource()
                source.buffer = decoded
                source.connect(offline.destination)
                source.start()
                const rendered = await offline.startRendering()
                resolveBlob(new Blob([encodeWav(rendered.getChannelData(0), WAV_SAMPLE_RATE)], { type: 'audio/wav' }))
            }
            finally
            {
                void decodeCtx.close()
            }
        }
        catch(e: unknown)
        {
            rejectBlob(e)
        }
    }

    const capTimer = setTimeout(() => { void finish() }, MAX_RECORD_SECONDS * 1000)

    return {
        stop: (): Promise<Blob> =>
        {
            void finish()
            return done
        },
    }
}

//endregion
