package dev.kurvcygnus.soulnotes

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * WebView 壳主 Activity (spec §4): assets 前端经 AssetLoader 以 https 假域加载 (安全上下文,
 * getUserMedia/localStorage 完整可用), API/WS/SSE 跨域直连远程后端.
 */
class MainActivity : ComponentActivity()
{
    private lateinit var webView: WebView

    //* 运行时权限未决回调簿记 (P3 Task 2 通用化): requestCode → 回调 — 原单槽位 micResult 无法承载第二权限
    //* (POST_NOTIFICATIONS), 扩为按请求码分槽; 麦克风路径经 requestMicPermission 委托通用通道, 行为不变.
    private val permissionResults = mutableMapOf<Int, (Boolean) -> Unit>()

    @SuppressLint("SetJavaScriptEnabled") //! WebView 壳的本质就是跑自打包前端, JS 必开; 静态检查告警不适用于本场景.
    override fun onCreate(savedInstanceState: Bundle?)
    {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)  //* edge-to-edge: 安全区由壳层 insets 转 WebView padding 承接 (评审 R1 裁定, CSS env() 方案废弃).
        webView = WebView(this)
        webView.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        webView.addJavascriptInterface(SystemBarBridge(this), "AndroidShell")  //* 系统栏主题桥 (Task 9): 必须先于 loadUrl 注入, 首帧主题上报才可达.
        //* 通知/触感桥 (P3 Task 2): 独立命名注入而非并入 AndroidShell (SystemBarBridge) — 两桥职责正交
        //* (系统栏主题 vs 系统通知/触感), 分对象注入使前端 JS 可见面最小化, 且与实现类一一对应.
        webView.addJavascriptInterface(NotificationBridge(this), "AndroidShellNotify")  //* 同样必须先于 loadUrl 注入.
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder().
            setDomain(APP_HOST).
            addPathHandler("/", SpaPathHandler(this)).
            build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false  //* 语音转写回填后自动聚焦播报; getUserMedia 走权限桥 (Task 8) 与此无关.
        }
        webView.webViewClient = object : WebViewClientCompat()
        {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            //* 系统夜间态可靠再推 (D1 防御修复): onCreate 里的首推可能早于页面模块脚本挂好 __SoulShell
            //* 钩子 (evaluateJavascript 可选链静默但值会丢), onPageFinished 时刻页面脚本必已执行完毕,
            //* 在此补推保证冷启动初始值必达 — 多推一次幂等无害.
            override fun onPageFinished(view: WebView, url: String)
            {
                super.onPageFinished(view, url)
                pushSystemMode()
            }

            //* 外流 URL 桥接 (终审 Important-2): WebView 默认把 tel:/sms:/mailto: 静默吞掉, target="_blank" 直接忽略 —
            //* RED 弹窗 "立即拨打" 主 CTA 与热线 (tel:) 及预约入口等外链在壳内会全变死链, 安全路径不可断, 故一律外抛系统.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean
            {
                val uri = request.url
                //* 壳内假域 → 放行壳内导航 (SPA 路由/资源走 AssetLoader); 其余 scheme 一律外抛.
                if(uri.host == APP_HOST)
                    return false
                return externalize(uri)
            }
        }
        webView.webChromeClient = MicPermissionBridge(this)  //* getUserMedia 权限桥 (Task 8): 必须先于 loadUrl 挂好.

        //* edge-to-edge insets 转视口内缩 (评审 Critical, R1 真机两连修正):
        //* 1) listener 挂 android.R.id.content 而非 webView — 真机 (Android 16/API 36) 实测挂 webView 时
        //*    WebView 自身的 inset 处理吞掉分派, listener 永不触发; 内容根是普通 FrameLayout, 分派必然到达.
        //* 2) padding 落 content (FrameLayout) 而非 webView — 实测对 webView setPadding 日志确认已设,
        //*    但 Chromium 渲染不重排 (汉堡钮仍压状态栏); padding 落父布局则 webView frame 被布局内缩
        //*    (实测 [0,120][1080,2241]), 页面渲染随之让位.
        //* systemBars + ime 两种 inset 统一内缩 — 系统栏不再遮挡页顶/页底 (topbar/输入行), 键盘顶起输入区
        //* API 全级可靠 (decorFits=false 下 API 30+ adjustResize 已失效, ime inset 是唯一正确通路; 真机实测
        //* 键盘 b=897 时 webViewH 2121→1356, 输入框完整可见). CONSUMED 防止 insets 继续下发 webView 二次处理.
        //* WebView 视口 env() 恒 0, 前端无需也无法再消费安全区 — Task 10 的 CSS env() 方案就此废弃;
        //* padding 区透出 content 根垫色 (SystemBarBridge 随前端主题上报, 首帧前为窗底色 #181B18) —
        //* 垫色通道缺位曾致 API 35+ 亮色主题条带色差 (盲改裁定 2026-10-04, 已由色桥补齐).
        val content = findViewById<View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        //? WebView 远程调试 (CDP): 仅 debug 构建开启, 供 chrome://inspect 精确驱动 DOM 走查; release 不受影响.
        //? 门禁走 FLAG_DEBUGGABLE 而非 BuildConfig.DEBUG: buildConfig=true 会生成 BuildConfig.java, 令
        //? compileJavaWithJavac 脱离 NO-SOURCE 并强制解析 androidJdkImage — GraalVM JDK 21 的 jlink 处理
        //? AGP 合成 java.base 必失败 ("Module jdk.internal.vm.ci not found", 实测定罪), 本机 JDK 矩阵
        //? (graalvm-jdk-21/graalvm-ce-25/openjdk-26) 无一能同时满足 Gradle 8.10.2 与非 GraalVM jlink,
        //? 故 buildConfig 必须保持关闭, debug 语义经运行时 flag 等价还原.
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if(debuggable)
            WebView.setWebContentsDebuggingEnabled(true)
        webView.loadUrl("https://$APP_HOST/index.html")

        //* 系统夜间态首推 (D1 防御修复): "跟随系统"档的前端解析以壳层上报为第一数据源, 冷启动即推初始值 —
        //! 此刻页面模块脚本可能尚未挂好 __SoulShell 钩子 (调用无害但值会丢), onPageFinished 处有可靠补推,
        //! 两通道最终一致, 此处只求尽早.
        pushSystemMode()

        //* 返回键路由 (spec §4): WebView 历史栈内有上一页 (SPA 深链/浮层哨兵 entry) → goBack 交给
        //* 前端 (哨兵 popstate 关浮层 / 路由回退); 已到根 → 双击退出. 2s 窗口 Toast 提示.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true)
        {
            private var lastBackAt = 0L

            override fun handleOnBackPressed()
            {
                if(webView.canGoBack())
                {
                    webView.goBack()
                    return
                }
                val now = SystemClock.elapsedRealtime()
                if(now - lastBackAt < 2000)
                    finish()
                else
                {
                    lastBackAt = now
                    Toast.makeText(this@MainActivity, "再按一次退出", Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    //* uiMode 变化自理 (D1 防御修复, 与 AndroidManifest configChanges 的 uiMode 声明成对): 壳不因夜间
    //! 态翻转重建 Activity, 真实系统态由此处主动前推前端 — 实测定罪 (OPPO/ColorOS API 36): WebView 的
    //* prefers-color-scheme 会被厂商深色兼容层与 AOSP uiMode 解耦钉死 (cmd uimode 翻 0x11<->0x21 后
    //* matchMedia 恒 dark), 前端"跟随系统"不得依赖 matchMedia 单源, 壳层推送是唯一可信通道.
    override fun onConfigurationChanged(newConfig: Configuration)
    {
        super.onConfigurationChanged(newConfig)
        pushSystemMode()
    }

    //* 系统夜间态前推: window.__SoulShell.onSystemModeChange(<dark>) — 前端钩子缺席时可选链静默,
    //* 纯浏览器/老壳形态零影响.
    private fun pushSystemMode()
    {
        //* 读 applicationContext 而非 Activity 自身配置: configChanges 含 uiMode 时 Activity 配置的
        //! 更新时序依赖分派路径 (存在冻结窗口), 而 applicationContext 的 Resources 配置由 ActivityThread
        //* 在分派回调前先行更新到全局最新态 — 回调时刻取它恒为真实系统夜间态, 不随 Activity 冻结.
        val dark = (applicationContext.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        webView.evaluateJavascript("window.__SoulShell?.onSystemModeChange($dark)", null)
    }

    //* 外流 intent 外抛: tel → 拨号盘, sms/mailto → 系统发送器, 其余 (http(s)/intent:) → 浏览器/系统裁决.
    private fun externalize(uri: Uri): Boolean
    {
        val intent = when(uri.scheme)
        {
            "tel" -> Intent(Intent.ACTION_DIAL, uri)
            "sms", "mailto" -> Intent(Intent.ACTION_SENDTO, uri)
            else -> Intent(Intent.ACTION_VIEW, uri)
        }
        return try
        {
            startActivity(intent)
            true
        }
        catch(_: Exception) { true }//! 无 handler (无拨号器/浏览器) 等异常一律吞: 返回 true 按"已消费"处理, 外流失败不得拖崩壳.
    }

    //* 运行时权限申请 (通用, P3 Task 2): 单次请求, 结果回调化供桥使用; 同 requestCode 槽位覆盖语义沿用原
    //* 单槽位设计 — 单 Activity 单弹窗场景不存在并发申请, 前一次未决回调以 false 即刻作废.
    fun requestPermission(perm: String, requestCode: Int, onResult: (Boolean) -> Unit)
    {
        if(ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED)
        {
            onResult(true)
            return
        }
        permissionResults.put(requestCode, onResult)?.invoke(false)
        ActivityCompat.requestPermissions(this, arrayOf(perm), requestCode)
    }

    //* 麦克风权限入口 (Task 8 契约保持): getUserMedia 桥专用薄封装, 落到通用申请通道.
    fun requestMicPermission(onResult: (Boolean) -> Unit)
    {
        requestPermission(android.Manifest.permission.RECORD_AUDIO, MIC_REQUEST_CODE, onResult)
    }

    @Deprecated("androidx.activity 1.9 起此回调被弃用 (官方转向 Activity Result API), 但本壳仅双权限双场景 (麦克风/通知), 沿用经典回调设计 — 弃用成员仍由框架正常回调.")
    @Suppress("DEPRECATION")  //! super 调用命中弃用 API — 见上, 函数级抑制达成零警告.
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray)
    {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        //* 按请求码分发到对应槽位 (P3 Task 2): 未知请求码 remove 落空即忽略, 语义等价原早退守卫.
        permissionResults.remove(requestCode)?.invoke(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
    }

    override fun onDestroy()
    {
        permissionResults.clear()  //* 防销毁后回调: 权限弹窗期间 Activity 被销毁时, 迟到结果落空即丢弃, 不悬挂已死 Activity 的闭包.
        webView.destroy()
        super.onDestroy()
    }

    companion object
    {
        //* WebViewAssetLoader 官方保留假域: 证书链由 loader 内部兜住, 前端视为 https 安全上下文.
        const val APP_HOST = "appassets.androidplatform.net"

        private const val MIC_REQUEST_CODE = 47

        //* 通知权限申请槽位 (P3 Task 2): 与 MIC_REQUEST_CODE 同簿记表, 恒异值 — 供 NotificationBridge 引用.
        const val NOTIFY_REQUEST_CODE = 48
    }
}
