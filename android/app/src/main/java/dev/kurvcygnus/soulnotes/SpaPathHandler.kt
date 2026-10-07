package dev.kurvcygnus.soulnotes

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader

/**
 * SPA 路径处理器: 命中真实资源 (静态文件) 原样回, 未命中一律回落 index.html —
 * BrowserRouter 的深链 (/settings 等) 无对应文件, 缺 fallback 即 404 白屏.
 *
 * @implNote 委托 [[WebViewAssetLoader.AssetsPathHandler]] 挂 assets 根, 回落响应手构
 * (text/html + assets/index.html); 流须 Buffer 包一层, 部分安卓版本对拦截响应做 range/重置读取.
 */
class SpaPathHandler(context: Context) : WebViewAssetLoader.PathHandler
{
    private val delegate = WebViewAssetLoader.AssetsPathHandler(context)
    private val appContext = context.applicationContext

    override fun handle(path: String): WebResourceResponse?
    {
        val hit = delegate.handle(path)
        //! webkit 1.12.1 未命中不再返 null, 而是 (null, null, null) 空响应 (AssetsPathHandler 字节码实证);
        //! 若只判 null, /settings 等深链/刷新会放行空响应 → 白屏. 真实资源 mime 恒非 null, 以此区分.
        if(hit != null && hit.mimeType != null)
            return hit
        //* index.html 恒在 (构建产物), open 失败属打包损坏 — 交给 WebView 呈现 404 而非吞异常.
        val fallback = appContext.assets.open("index.html").buffered()
        return WebResourceResponse("text/html", "utf-8", fallback)
    }
}
