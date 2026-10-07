package dev.kurvcygnus.soulnotes

import android.graphics.Color
import android.view.View
import android.webkit.JavascriptInterface
import androidx.core.view.WindowCompat

/**
 * 系统栏主题桥 (spec §4/§5.3): 前端 applyTheme 上报当前主题底色与图标深浅, 壳同步
 * 状态栏/导航栏 — WebView 全屏铺满 (edge-to-edge) 时系统栏必须随主题, 否则深色主题下白条刺眼.
 *
 * @implNote JS 注入对象全局可见: 只暴露 setSystemBar 一个方法, 颜色解析失败静默忽略
 * (恶意/异常输入最坏结果是系统栏不动, 无攻击面). 回调切主线程.
 */
class SystemBarBridge(private val activity: MainActivity)
{
    @Suppress("DEPRECATION")  //! statusBarColor/navigationBarColor 在 API 35 起被标记 deprecated 且 edge-to-edge 强制下部分失效 —
    //! 本工程 targetSdk 35: 该两行在新系统上可能 no-op (系统栏本就透明, 底色由 WebView 页面自身承接),
    //! 在旧系统 (26-34) 上是主路径. 抑制以达成零警告纪律, 理由如上.
    @JavascriptInterface
    fun setSystemBar(bgHex: String?, darkIcons: Boolean)
    {
        //* 终审加固: JS 桥入参不可信 (壳外页面/异常注入可传 null), 卫语句直接忽略 —
        //! 参数须声明可空: 非 null 声明会在桥入口插入 Intrinsics 断言, JS 传 null 即 NPE 崩溃, 卫语句形同虚设.
        if(bgHex == null)
            return
        activity.runOnUiThread {
            val color = try
            {
                Color.parseColor(bgHex.trim())
            }
            catch(_: IllegalArgumentException) { return@runOnUiThread }//! 非法色值直接忽略: 前端令牌恒为 #RRGGBB, 此分支纯防御.
            activity.window.statusBarColor = color
            activity.window.navigationBarColor = color
            //* API 35+ 亮色条带修复 (盲改裁定 2026-10-04): 新系统上弃用的 bar color 通道 no-op, 安全区
            //! padding 带透出的是主题窗底 (#181B18 固定深色) — 亮色主题下条带与页面割裂成黑条.
            //* content 根垫上上报色后, padding 带 (含键盘顶起带) 随前端主题走, 深浅两档观感连续.
            val content = activity.findViewById<View>(android.R.id.content)
            content.setBackgroundColor(color)
            //* 图标深浅随亮暗反转: 前端契约 darkIcons = 生效亮档 (亮页深图标) — isAppearanceLightStatusBars
            //* 语义 (亮色外观 = 深图标) 与之同向, 直接赋值即随主题反转; 导航栏同步保持一体观感.
            val controller = WindowCompat.getInsetsController(activity.window, content)
            controller.isAppearanceLightStatusBars = darkIcons
            controller.isAppearanceLightNavigationBars = darkIcons
        }
    }
}
