package kurvcygnus.soulnotes.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import kurvcygnus.soulnotes.utils.PrintUtils;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * <b>OpenAI 兼容 Mock-LLM 服务器 (测试基建)</b>
 * <p>JDK 内置 {@code com.sun.net.httpserver} 零依赖实现, 随机端口启动, 供 {@link MockLlmProfile}
 * 将 LangChain4j base-url 指向本机. 四种可编程模式:</p>
 * <ul>
 *     <li>① 非流式纯文本 — {@link #respondWithText(String)}; 变体 {@link #respondWithClinical(String, String)}
 *     在正文尾部追加 soulnotes 契约块 (拆流落库全链路测试用)</li>
 *     <li>② 流式 SSE — {@link #respondWithChunks(String...)}, 请求 {@code stream=true} 时按 chunk 序列下发并以 {@code [DONE]} 收尾</li>
 *     <li>③ 工具调用 — {@link #respondWithToolCall(String)}, 首轮返回 {@code tool_calls};
 *     次轮 (请求携带 {@code role=tool} 消息) 回显工具结果文本; 流式客户端的工具两轮同样支持 —
 *     首轮 SSE 下发 tool_calls delta chunk, 次轮 SSE 回显文本 chunk (quarkus-langchain4j 流式客户端
 *     对工具轮恒以 stream=true 发送, 旧 "工具轮恒非流式" 假设不成立, 2026-10-06 修订)</li>
 *     <li>④ 预警 JSON — 请求体携带 {@link #RED_KEYWORD} 且不携带工具时, 返回 {@code warningLevel=RED} 的检测结果 JSON</li>
 *     <li>⑤ 会话标题 — 请求体携带 {@link #TITLE_ANCHOR} 且不携带工具时, 返回 canned 标题文本;
 *     {@link #failTitleRequests()} 布防后改返 500 (fail-open 兜底用例)</li>
 *     <li>⑥ 候选追问 — 请求体携带 {@link #FOLLOWUP_ANCHOR} 且不携带工具时, 返回 canned 追问 JSON 数组
 *     (恰好 3 条字符串); {@link #failFollowupRequests()} 布防后改返 500 (fail-open 兜底用例).
 *     锚点判定先于标题锚点: 两类提示词文本互不包含, 顺序仅为路由确定性</li>
 * </ul>
 * <p>请求区分契约: 请求体含 {@code tools} 数组视为共情对话 Agent, 否则视为结构化输出 Agent (预警检测).
 * 每个请求体全文按序录制, 供用例断言 systemPrompt 组装与工具轮次.</p>
 *
 * <p>双 realm 共享契约: QuarkusTest 的 FacadeClassLoader 会在测试域与运行域各加载一次本类
 * (static 字段随类加载复制, 单例字段不可跨域共享). 因此 {@link #shared()} 以 JVM 全局 System property
 * 仲裁端口唯一归属: 先到的域启动真实服务器, 后到的域得到指向同一端口的远程句柄, 编程/查询经
 * {@code /__mock/*} 控制端点转发, 保证所有域看到同一份状态与录制.</p>
 * @since 1.1.0
 */
public final class MockLlmServer
{
    //* 预警链路探测关键词: 无工具请求命中即返回 RED JSON, 集成测试以消息内容触发预警分支.
    public static final String RED_KEYWORD = "SOULNOTES-RED-PROBE";

    //* 会话标题链路契约: 标题 Agent 请求不带 tools, 与预警检测请求同形态 — 以标题系统提示词的
    //* 稳定锚点词区分; 命中即返回 canned 标题 (预警 JSON 对标题链路无断言价值).
    public static final String TITLE_ANCHOR = "会话标题";
    public static final String TITLE_REPLY  = "备考夜谈";

    //* 候选追问链路契约: 追问 Agent 请求同样不带 tools — 以追问系统提示词的稳定锚点词区分
    //* (锚点词落在 [[AiPromptConstants#FOLLOWUP_SYSTEM_PROMPT]] 首句, 改写提示词须同步);
    //* canned 产物为严格 JSON 字符串数组, 与生产侧解析容错的对账基准一致.
    public static final String FOLLOWUP_ANCHOR = "候选追问";
    public static final String FOLLOWUP_REPLY  = "[\"追问甲\",\"追问乙\",\"追问丙\"]";

    //* JVM 全局端口仲裁键: System property 跨类加载器域共享, 是本类唯一的跨域同步点.
    private static final String PORT_PROPERTY = "soulnotes.mock-llm.port";

    //region 内部状态
    private enum Mode { TEXT, SSE, TOOL }

    private final ObjectMapper mapper = new ObjectMapper();
    //* 服务器域: HttpServer 与录制列表仅在启动域非空; 远程域两者为 null, 经控制端点转发.
    private final HttpServer server;
    private final List<String> requestBodies = Collections.synchronizedList(new ArrayList<>());
    private final HttpClient controlHttp;
    private final int port;

    //* 响应状态: Quarkus worker 线程并发读, 测试线程写, volatile 保证可见性.
    private volatile Mode mode = Mode.TEXT;
    private volatile String replyText = "";
    private volatile List<String> sseChunks = List.of();
    private volatile String toolFunction = "getCrisisMessage";
    //* 标题请求故障布防: 置位后标题锚点请求显式 500, 供 fail-open 兜底落库用例驱动 AI 失败分支.
    private volatile boolean titleError = false;
    //* 候选追问请求故障布防: 置位后追问锚点请求显式 500, 供 fail-open (聊天不受影响) 用例驱动 AI 失败分支.
    private volatile boolean followupError = false;

    private MockLlmServer(HttpServer server)
    {
        this.server = server;
        this.port = server.getAddress().getPort();
        this.controlHttp = null;
    }

    //* 远程句柄构造: 不持有服务器, 全部编程与查询经 HTTP 转发至真实端口.
    private MockLlmServer(int port)
    {
        this.server = null;
        this.port = port;
        this.controlHttp = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }
    //endregion

    //region 生命周期
    //* 独立启动 (无 Quarkus 参与, 如纯 JUnit 契约自检): 直接持有真实服务器.
    public static MockLlmServer start()
    {
        final HttpServer created;
        try { created = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0); }
        catch(IOException e) { throw new IllegalStateException("Mock-LLM 随机端口绑定失败", e); }

        final var instance = new MockLlmServer(created);
        instance.registerContexts();
        //* SSE 逐 chunk 写出会阻塞线程, 默认 executor 为单线程派发, 并发请求 (对话轮 + 预警轮) 会互卡.
        created.setExecutor(Executors.newFixedThreadPool(4, MockLlmServer::daemonThread));
        created.start();
        return instance;
    }

    //* 双 realm 共享入口: JVM 内首个调用域启动真实服务器并登记端口, 后续域返回远程句柄.
    public static synchronized MockLlmServer shared()
    {
        final var registered = System.getProperty(PORT_PROPERTY);
        if(registered != null)
            return new MockLlmServer(Integer.parseInt(registered));

        final var instance = start();
        System.setProperty(PORT_PROPERTY, String.valueOf(instance.port()));
        return instance;
    }

    public void stop()
    {
        if(server != null)
            server.stop(0);
    }

    public int port() { return port; }

    public String baseUrl() { return PrintUtils.quickFormat("http://localhost:{}", port); }

    private void registerContexts()
    {
        server.createContext("/v1/chat/completions", this::handleChatCompletions);
        server.createContext("/v1/models", this::handleModels);
        server.createContext("/__mock/state", this::handleStateControl);
        server.createContext("/__mock/reset", this::handleResetControl);
        server.createContext("/__mock/requests", this::handleRequestsControl);
        server.createContext("/__mock/title-error", this::handleTitleErrorControl);
        server.createContext("/__mock/followup-error", this::handleFollowupErrorControl);
    }

    private static Thread daemonThread(Runnable task)
    {
        final var thread = new Thread(task, "mock-llm-worker");
        thread.setDaemon(true);
        return thread;
    }
    //endregion

    //region 可编程响应
    //* ① 模式: 非流式纯文本回复.
    public void respondWithText(String text)
    {
        if(controlHttp != null)
        {
            controlState(statePayload("TEXT", text, null, null));
            return;
        }
        mode = Mode.TEXT;
        replyText = text;
    }

    //* 副医生模式变体: 非流式正文 + 尾部 soulnotes 契约块, 供拆流落库全链路用例布防.
    //* 经 respondWithText 委托落地, 远程域转发与 reset() 复位语义天然继承 (mode/replyText 同一状态槽).
    public void respondWithClinical(String text, String clinicalJson)
    {
        respondWithText(text + "\n<!--soulnotes " + clinicalJson + "-->");
    }

    //* ② 模式: 流式 SSE chunk 序列 (顺序保真, 逐 chunk 独立事件下发).
    public void respondWithChunks(String... chunks)
    {
        if(controlHttp != null)
        {
            controlState(statePayload("SSE", null, List.of(chunks), null));
            return;
        }
        mode = Mode.SSE;
        sseChunks = List.of(chunks);
    }

    //* ③ 模式: 首轮返回 tool_calls, 次轮 (请求携带 role=tool) 回显工具结果.
    public void respondWithToolCall(String function)
    {
        if(controlHttp != null)
        {
            controlState(statePayload("TOOL", null, null, function));
            return;
        }
        mode = Mode.TOOL;
        toolFunction = function;
    }

    //* ④ 模式免编程: 请求体携带 RED_KEYWORD 即返回 RED 预警 JSON (关键词契约, 无需预先布防).
    //* 标题请求故障布防: 置位后标题锚点请求一律 500 (模拟 AI 故障, fail-open 兜底用例); reset() 自动解除.
    public void failTitleRequests()
    {
        if(controlHttp != null)
        {
            control("POST", "/__mock/title-error", Map.of("enabled", true));
            return;
        }
        titleError = true;
    }

    //* 候选追问请求故障布防: 置位后追问锚点请求一律 500 (模拟 AI 故障, fail-open 用例); reset() 自动解除.
    public void failFollowupRequests()
    {
        if(controlHttp != null)
        {
            control("POST", "/__mock/followup-error", Map.of("enabled", true));
            return;
        }
        followupError = true;
    }

    //* 清空录制与编程状态, 用例间互不串扰.
    public void reset()
    {
        if(controlHttp != null)
        {
            control("POST", "/__mock/reset", null);
            return;
        }
        clearLocalState();
    }

    private void clearLocalState()
    {
        requestBodies.clear();
        mode = Mode.TEXT;
        replyText = "";
        sseChunks = List.of();
        toolFunction = "getCrisisMessage";
        titleError = false;
        followupError = false;
    }

    //* 已收请求体快照 (按到达顺序), 供断言 systemPrompt 组装与工具轮次.
    public List<String> requests()
    {
        if(controlHttp != null)
        {
            try { return stringList(parse(control("GET", "/__mock/requests", null)).path("requests").path("bodies")); }
            catch(IOException e) { throw new IllegalStateException("Mock-LLM 录制读取失败", e); }
        }
        synchronized(requestBodies) { return List.copyOf(requestBodies); }
    }

    //* JsonNode 数组 -> 字符串列表 (项目 Jackson 版本无 toList 便捷方法).
    private static List<String> stringList(JsonNode array)
    {
        final var result = new ArrayList<String>();
        for(final var node: array)
            result.add(node.asText());
        return List.copyOf(result);
    }
    //endregion

    //region 控制端点 (远程域 -> 真实服务器)
    private Map<String, Object> statePayload(String modeName, String text, List<String> chunks, String tool)
    {
        final var payload = new LinkedHashMap<String, Object>();
        payload.put("mode", modeName);
        payload.put("text", text);
        payload.put("chunks", chunks);
        payload.put("toolFunction", tool);
        return payload;
    }

    private void controlState(Map<String, Object> payload)
    {
        control("POST", "/__mock/state", payload);
    }

    //* 控制调用收口: 任何控制端点失败都快速抛出 (测试基建失联必须立即暴露, 不允许静默空转).
    private String control(String method, String path, Map<String, Object> payload)
    {
        try
        {
            final var builder = HttpRequest.newBuilder(URI.create(PrintUtils.quickFormat("http://localhost:{}{}", port, path)));
            if("POST".equals(method) && payload != null)
                builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)));
            else
                builder.GET();
            return controlHttp.send(builder.build(), HttpResponse.BodyHandlers.ofString()).body();
        }
        catch(IOException | InterruptedException e)
        {
            if(e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException(PrintUtils.quickFormat("Mock-LLM 控制端点 {}{} 调用失败", port, path), e);
        }
    }

    private void handleStateControl(HttpExchange exchange) throws IOException
    {
        final var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        final var state = parse(body);
        mode = Mode.valueOf(state.path("mode").asText("TEXT"));
        final var textNode = state.path("text");
        replyText = textNode.isMissingNode() || textNode.isNull() ? "" : textNode.asText("");
        final var chunksNode = state.path("chunks");
        sseChunks = chunksNode.isArray() && !chunksNode.isEmpty() ? stringList(chunksNode) : List.of();
        final var toolNode = state.path("toolFunction");
        toolFunction = toolNode.isMissingNode() || toolNode.isNull() ? "getCrisisMessage" : toolNode.asText();
        writeRawJson(exchange, "{\"ok\":true}");
    }

    private void handleResetControl(HttpExchange exchange) throws IOException
    {
        exchange.getRequestBody().readAllBytes();
        clearLocalState();
        writeRawJson(exchange, "{\"ok\":true}");
    }

    private void handleRequestsControl(HttpExchange exchange) throws IOException
    {
        exchange.getRequestBody().readAllBytes();
        synchronized(requestBodies) { writeJson(exchange, Map.of("requests", Map.of("bodies", List.copyOf(requestBodies)))); }
    }

    //* 标题故障布防的远程转发端点: 远程域经此置位真实服务器的 titleError 标志.
    private void handleTitleErrorControl(HttpExchange exchange) throws IOException
    {
        final var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        titleError = parse(body).path("enabled").asBoolean(false);
        writeRawJson(exchange, "{\"ok\":true}");
    }

    //* 候选追问故障布防的远程转发端点: 远程域经此置位真实服务器的 followupError 标志 (标题端点同款).
    private void handleFollowupErrorControl(HttpExchange exchange) throws IOException
    {
        final var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        followupError = parse(body).path("enabled").asBoolean(false);
        writeRawJson(exchange, "{\"ok\":true}");
    }
    //endregion

    //region 请求处理
    private void handleChatCompletions(HttpExchange exchange) throws IOException
    {
        final var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        requestBodies.add(body);

        final JsonNode root;
        try { root = parse(body); }
        catch(IOException e)
        {
            writeRawJson(exchange, "{\"error\":{\"message\":\"请求体不是合法 JSON\"}}");
            return;
        }

        final var hasTools = root.path("tools").isArray() && !root.path("tools").isEmpty();
        if(hasTools)
        {
            final var toolResult = firstToolResultContent(root.path("messages"));
            final var streamRequested = root.path("stream").asBoolean(false);
            if(toolResult != null)
            {
                //* 次轮 (工具结果回灌): 流式客户端对工具轮同样 stream=true (OpenAiRestApi 按 Accept 头强制),
                //* SSE 回显文本 chunk; 非流式客户端按 JSON 整体回显.
                if(streamRequested)
                    writeSseRaw(exchange, textChunkJsons(echoChunks(echoToolResult(toolResult))));
                else
                    writeJson(exchange, completionPayload(echoToolResult(toolResult)));
            }
            else if(mode == Mode.TOOL)
            {
                if(streamRequested)
                    writeSseRaw(exchange, List.of(toolCallDeltaJson()));
                else
                    writeJson(exchange, toolCallPayload());
            }
            else if(mode == Mode.SSE && streamRequested)
                writeSse(exchange);
            else if(mode == Mode.SSE)
                writeJson(exchange, completionPayload(String.join("", sseChunks)));
            else
                writeJson(exchange, completionPayload(replyText));
            return;
        }
        //* 无工具请求 = 结构化输出 Agent (预警检测) / 标题 Agent / 追问 Agent: 以各自系统提示词锚点区分,
        //* 追问锚点先判 (两类提示词文本互不包含, 顺序仅为路由确定性).
        if(body.contains(FOLLOWUP_ANCHOR))
        {
            if(followupError)
            {
                writeRawJson(exchange, 500, "{\"error\":{\"message\":\"mock-followup-error\"}}");
                return;
            }
            writeJson(exchange, completionPayload(FOLLOWUP_REPLY));
            return;
        }
        if(body.contains(TITLE_ANCHOR))
        {
            if(titleError)
            {
                writeRawJson(exchange, 500, "{\"error\":{\"message\":\"mock-title-error\"}}");
                return;
            }
            writeJson(exchange, completionPayload(TITLE_REPLY));
            return;
        }
        //* 其余无工具请求 = 预警检测: 关键词命中返回 RED, 其余返回可解析的 NONE,
        //* 保证生产侧检测结果反序列化始终成功, 降级链路零告警噪音.
        writeJson(exchange, completionPayload(body.contains(RED_KEYWORD) ? RED_DETECTION_JSON : NONE_DETECTION_JSON));
    }

    private void handleModels(HttpExchange exchange) throws IOException { writeJson(exchange, Map.of("object", "list", "data", List.of())); }

    //* 找到首条 role=tool 消息的 content (工具执行结果), 无则返回 null.
    private static String firstToolResultContent(JsonNode messages)
    {
        for(final var message: messages)
        {
            if("tool".equals(message.path("role").asText()))
                return message.path("content").asText("");
        }
        return null;
    }

    //* 回显契约: 前缀钉死 (集成断言锚点) + 工具输出压缩截断, 换行拍平保证单行可断言.
    private static String echoToolResult(String toolContent)
    {
        final var compact = toolContent.replace('\n', ' ').strip();
        final var excerpt = compact.length() > 120 ? compact.substring(0, 120) : compact;
        return PrintUtils.quickFormat("工具结果回显确认: {}", excerpt);
    }
    //endregion

    //region 响应构造
    //* 预警检测结果 JSON (WarningDetectionResult 同形状): 作为 message.content 下发, 由生产侧反序列化.
    private static final String RED_DETECTION_JSON =
        "{\"warningLevel\":\"RED\",\"reason\":\"mock 检测到自伤风险信号\",\"suggestedAction\":\"立即展示危机热线\"}";
    private static final String NONE_DETECTION_JSON =
        "{\"warningLevel\":\"NONE\",\"reason\":\"\",\"suggestedAction\":\"\"}";

    private Map<String, Object> completionPayload(String content)
    {
        return completionShell("chat.completion", List.of(Map.of(
            "index", 0,
            "message", Map.of("role", "assistant", "content", content),
            "finish_reason", "stop")));
    }

    //* tool_calls 载荷: message.content 为 null (OpenAI 契约), 故用 LinkedHashMap 承载可空键.
    private Map<String, Object> toolCallPayload()
    {
        final var message = new LinkedHashMap<String, Object>();
        message.put("role", "assistant");
        message.put("content", null);
        message.put("tool_calls", List.of(Map.of(
            "id", "call-soulnotes-mock-1",
            "type", "function",
            "function", Map.of("name", toolFunction, "arguments", "{}")
        )));
        final var choice = new LinkedHashMap<String, Object>();
        choice.put("index", 0);
        choice.put("message", message);
        choice.put("finish_reason", "tool_calls");
        return completionShell("chat.completion", List.of(choice));
    }

    private Map<String, Object> chunkPayload(String content)
    {
        return completionShell("chat.completion.chunk", List.of(Map.of("index", 0, "delta", Map.of("content", content))));
    }

    //* 流式工具轮首响应: 单个 chunk 携带完整 tool_calls delta (id/type/function 一次给全),
    //* langchain4j ToolCallBuilder 累积后于流收口产出 ToolExecutionRequest — 无需 finish_reason chunk.
    private String toolCallDeltaJson()
    {
        final var function = new LinkedHashMap<String, Object>();
        function.put("name", toolFunction);
        function.put("arguments", "{}");
        final var call = new LinkedHashMap<String, Object>();
        call.put("index", 0);
        call.put("id", "call-soulnotes-mock-1");
        call.put("type", "function");
        call.put("function", function);
        final var delta = Map.of("tool_calls", List.of(call));
        try { return mapper.writeValueAsString(completionShell("chat.completion.chunk", List.of(Map.of("index", 0, "delta", delta)))); }
        catch(IOException e) { throw new IllegalStateException("tool_calls delta chunk 序列化失败", e); }
    }

    //* 文本回显拆两片下发 (先短前缀后余文): 契约测试以 chunk 拼接断言, 拆片证明多 chunk 流式真实到达.
    private static List<String> echoChunks(String text)
    {
        final int split = Math.min(4, text.length());
        return List.of(text.substring(0, split), text.substring(split));
    }

    //* 文本 chunk 列表 → chunk JSON 列表 (与 chunkPayload 同形状, 供 writeSseRaw 统一下发).
    private List<String> textChunkJsons(List<String> contents)
    {
        final var jsons = new ArrayList<String>(contents.size());
        for(final var content: contents)
        {
            try { jsons.add(mapper.writeValueAsString(chunkPayload(content))); }
            catch(IOException e) { throw new IllegalStateException("文本 chunk 序列化失败", e); }
        }
        return List.copyOf(jsons);
    }

    private Map<String, Object> completionShell(String object, List<Object> choices)
    {
        return Map.of(
            "id", "chatcmpl-soulnotes-mock",
            "object", object,
            "created", Instant.now().getEpochSecond(),
            "model", "soulnotes-mock-llm",
            "choices", choices
        );
    }
    //endregion

    //region 响应写出
    private void writeJson(HttpExchange exchange, Map<String, Object> payload) throws IOException
    {
        writeRawJson(exchange, mapper.writeValueAsString(payload));
    }

    private void writeSse(HttpExchange exchange) throws IOException
    {
        final var chunkJsons = new ArrayList<String>(sseChunks.size());
        for(final var chunk: sseChunks)
            chunkJsons.add(mapper.writeValueAsString(chunkPayload(chunk)));
        writeSseRaw(exchange, chunkJsons);
    }

    //* 通用 SSE 下发: 逐 chunk JSON 以 data: 行写出并以 [DONE] 收尾 (chunkPayload/toolCallDelta 共用).
    private static void writeSseRaw(HttpExchange exchange, List<String> chunkJsons) throws IOException
    {
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.sendResponseHeaders(200, 0);
        try(var out = exchange.getResponseBody())
        {
            for(final var chunkJson: chunkJsons)
            {
                out.write(PrintUtils.quickFormat("data: {}\n\n", chunkJson).getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
            out.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    private static void writeRawJson(HttpExchange exchange, String json) throws IOException
    {
        writeRawJson(exchange, 200, json);
    }

    private static void writeRawJson(HttpExchange exchange, int status, String json) throws IOException
    {
        final var bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try(var out = exchange.getResponseBody()) { out.write(bytes); }
    }

    private JsonNode parse(String json) throws IOException { return mapper.readTree(json); }
    //endregion
}
