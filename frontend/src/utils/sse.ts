//* SSE 传输层解析器: Quarkus Mutiny 每条消息一个 `data:` 帧, 完整事件以空行分隔;
//* 帧会跨网络 chunk 任意拆开 (且可能出现 CRLF), 半截事件必须留在缓冲区等待补齐, 否则流式输出会丢字.
export function createSseParser(onEvent: (data: string) => void): { push(chunk: string): void; end(): void }
{
    let buffer = ''

    //* 将一个完整事件块归并为单个 data 字符串: 同事件多条 `data:` 行按 SSE 规范以 \n 连接;
    //* 注释 (`:` 开头) 与非 data 行 (event/id/retry) 在传输层直接丢弃, 本层只透传 data, 元事件过滤留给上层.
    const flush = (block: string) =>
    {
        const data = block.split(/\r?\n/).
            filter(l => l.startsWith('data:')).
            map(l => l.slice(5).replace(/^ /, '')).//* 字段名后至多一个可选空格, 只剥一个, 负载自身的多余空格必须保留.
            join('\n')
        if(data)//* 空负载 (纯注释/纯 keep-alive 帧) 不派发, 避免向聊天管道注入空消息.
            onEvent(data)
    }

    return {
        push(chunk: string)
        {
            buffer += chunk
            //* 以空行为界切段; `\r?\n\r?\n` 同时覆盖 \n\n / \n\r\n / \r\n\n / \r\n\r\n, 因此混合换行风格也算空行.
            const blocks = buffer.split(/\r?\n\r?\n/)
            //! split 至少返回一个元素, pop 不会真正取到 undefined, `??` 仅为满足严格类型收窄.
            buffer = blocks.pop() ?? ''
            //* 末段可能是无结尾空行的半截事件, 必须留在缓冲区等下一个 chunk; 若在此冲刷会把流式输出截断成两半.
            for(const block of blocks)
                flush(block)
        },
        end()
        {
            //* 服务端可能在发出最后一个事件后不带结尾空行就关流, 关闭时冲刷残留缓冲保证尾事件不丢.
            if(buffer.trim())//* trim 判空: 残留若只是分隔符/空白, 冲刷也只会得到空 data, 直接跳过.
                flush(buffer)
            buffer = ''
        },
    }
}
