package dev.kurvcygnus.soulnotes

import android.Manifest
import android.content.pm.PackageManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import androidx.core.content.ContextCompat

/**
 * 麦克风权限桥 (spec §4): WebView 的 getUserMedia 触发 onPermissionRequest →
 * 已授权直接 grant; 未授权转 Android 运行时弹窗, 结果异步回灌 grant()/deny().
 *
 * @implNote 拒绝时不 grant — 前端 recordAudio 的 rejection 链已有 toast 兜底 ("无法访问麦克风"),
 * 壳层不重复提示. 回调可能挂在非主线程, grant/deny 需切主线程 (WebView 线程约束).
 */
class MicPermissionBridge(private val activity: MainActivity) : WebChromeClient()
{
    override fun onPermissionRequest(request: PermissionRequest)
    {
        val audioGranted = ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if(audioGranted)
        {
            activity.runOnUiThread { request.grant(request.resources) }
            return
        }
        activity.requestMicPermission { granted ->
            activity.runOnUiThread {
                if(granted)
                    request.grant(request.resources)
                else
                    request.deny()
            }
        }
    }
}
