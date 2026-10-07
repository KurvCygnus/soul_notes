package dev.kurvcygnus.soulnotes

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * 通知与触感壳桥 (P3 Task 2): 后端 WS ext-notification 事件的壳侧出口 — 消费路径由前端按 WebView
 * 可见性裁决 (应用前台 → 应用内横幅; 应用后台 → 调本桥发系统通知), 壳层不重复判定前后台.
 *
 * @implNote JS 注入对象全局可见: 桥入参不可信 (与 SystemBarBridge 同纪律), 全部声明可空 + 卫语句 —
 * 非 null 声明会在桥入口插入 Intrinsics 断言, JS 传 null 即 NPE 崩壳.
 */
class NotificationBridge(private val activity: MainActivity)
{
    //* 系统通知出口: tag 供前端区分事件类别 (同 tag 后到覆盖先到, 异 tag 并存), title/body 缺席时回落 app 名/空文案.
    @JavascriptInterface
    fun notify(tag: String?, title: String?, body: String?)
    {
        activity.runOnUiThread { postNotification(tag, title, body) }
    }

    //* 触感出口: 20ms 短振一次 (消息送达等轻反馈), 无振动器件静默忽略.
    @JavascriptInterface
    fun haptic()
    {
        activity.runOnUiThread { vibrateShort() }
    }

    //region 系统通知
    private fun postNotification(tag: String?, title: String?, body: String?)
    {
        //* 通知运行时权限门控: API 33 起才有 POST_NOTIFICATIONS 弹窗; 26-32 平台无此权限项 (默认可通知) —
        //! 26-32 上对未知权限 checkSelfPermission 恒返 DENIED, 不做版本门控会把老设备全量哑火成"零通知".
        val granted = if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        else
            true
        if(!granted)
        {
            //* 未授权 → 首呼触发系统弹窗; 本条通知即弃 (下次事件再走完整链路) — 授权结果只翻状态位,
            //! 不回灌补发, 避免用户刚点完"允许"就被延迟到达的陈旧告警突袭. 系统对二次请求静默拒绝时
            //! 恒走此分支, 通知保持 opt-in 默认零通知, 前端横幅路径不受影响.
            activity.requestPermission(Manifest.permission.POST_NOTIFICATIONS, MainActivity.NOTIFY_REQUEST_CODE) { }
            return
        }
        ensureChannel()
        val intent = Intent(activity, MainActivity::class.java).apply {
            //* CLEAR_TOP|SINGLE_TOP: 应用在后台时点击通知前置既有任务复用现存实例 (onNewIntent 无深度负载
            //* 需求, 页面状态原样保留), 不新开重复实例; 应用未运行则新建任务 — 两种形态确定性可达.
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(activity, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(activity, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_fg)  //* 单色矢量气泡: 既有 drawable 里唯一适合状态栏小图的形态 (自适应 mipmap 在通知槽渲染观感差)
            .setContentTitle(title ?: activity.getString(R.string.app_name))
            .setContentText(body ?: "")
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(activity).notify(tag, NOTIFY_ID, notification)
    }

    //* 渠道惰性创建: 首条通知前确保 "ext" 渠道在位 — minSdk 26 起 NotificationChannel 是唯一通知路径, 无旧 API 分支.
    private fun ensureChannel()
    {
        val manager = activity.getSystemService(NotificationManager::class.java) ?: return  //! 系统服务缺席 (理论不可达) 静默放弃, 不崩壳
        if(manager.getNotificationChannel(CHANNEL_ID) != null)
            return
        val channel = NotificationChannel(CHANNEL_ID, activity.getString(R.string.channel_ext_name), NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(channel)
    }
    //endregion

    //region 触感
    private fun vibrateShort()
    {
        val vibrator = if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        else
            @Suppress("DEPRECATION")  //! API 26-30 无 VibratorManager, VIBRATOR_SERVICE 旧通道是唯一路径 — 该字段
            //! 自 API 31 起 deprecated, 按 Build.VERSION 分支让新系统走 Manager, 抑制仅为旧分支保底达成零警告.
            activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        vibrator?.vibrate(VibrationEffect.createOneShot(HAPTIC_MS, VibrationEffect.DEFAULT_AMPLITUDE))
    }
    //endregion

    companion object
    {
        //* 渠道 ID 与后端扩展事件命名对齐 (P3 契约: ext-notification → 渠道 "ext").
        private const val CHANNEL_ID = "ext"
        private const val NOTIFY_ID = 1  //* id 恒定: 同 tag 内后到覆盖先到, 异 tag 互不挤占 — 区分职责全在 tag
        private const val HAPTIC_MS = 20L
    }
}
