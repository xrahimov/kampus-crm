package center.kampus.call

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * A lesson in progress, as Android wants to see it: a foreground service with a
 * notice the person can tap to come back. While it runs, the microphone and the
 * camera keep working when another app is in front, and the phone does not put
 * the app to sleep in the middle of a lesson.
 *
 * It holds nothing itself: the call lives in the app's JavaScript. Starting it
 * needs the app to be in front, which it is when someone presses "Join".
 */
class CallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Kampus"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val channel = intent?.getStringExtra(EXTRA_CHANNEL) ?: title
    val notification = buildNotification(title, text, channel)
    try {
      goForeground(notification, wantedTypes())
    } catch (error: Exception) {
      // A phone that refuses the microphone or camera type (the permission was
      // taken away a moment ago) still lets the lesson be listened to.
      Log.w(TAG, "The lesson's service could not start with all its types", error)
      try {
        goForeground(notification, PLAYBACK)
      } catch (second: Exception) {
        Log.w(TAG, "The lesson's service did not start", second)
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  private fun goForeground(notification: Notification, types: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(NOTIFICATION_ID, notification, types)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  /** Only the kinds of use the person has allowed: Android refuses a type whose permission is missing. */
  private fun wantedTypes(): Int {
    var types = PLAYBACK
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (granted(Manifest.permission.RECORD_AUDIO)) {
        types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
      if (granted(Manifest.permission.CAMERA)) {
        types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
      }
    }
    return types
  }

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

  private fun buildNotification(title: String, text: String, channelName: String): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      // Quiet: it is there to come back by, not to interrupt the lesson.
      val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setSmallIcon(smallIcon())
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

    // A tap brings the lesson back to the front.
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      builder.setContentIntent(
        PendingIntent.getActivity(
          this,
          0,
          launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
    }
    return builder.build()
  }

  /** The app's one-colour notice icon where it has one, else its launcher icon. */
  private fun smallIcon(): Int {
    val own = resources.getIdentifier("ic_notification", "drawable", packageName)
    return if (own != 0) own else applicationInfo.icon
  }

  companion object {
    private const val TAG = "KampusCallService"
    private const val CHANNEL_ID = "kampus-lesson"
    private const val NOTIFICATION_ID = 4207
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_CHANNEL = "channel"

    // The constant's own name is API 29; its value is the same on every version.
    private const val PLAYBACK = 2 // ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK

    fun start(context: Context, title: String, text: String, channel: String): Boolean {
      val intent = Intent(context, CallService::class.java)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_CHANNEL, channel)
      return try {
        ContextCompat.startForegroundService(context, intent)
        true
      } catch (error: Exception) {
        // Android refuses when the app is not in front; the lesson goes on without the service.
        Log.w(TAG, "The lesson's service was refused", error)
        false
      }
    }

    fun stop(context: Context): Boolean =
      try {
        context.stopService(Intent(context, CallService::class.java))
      } catch (error: Exception) {
        false
      }
  }
}
