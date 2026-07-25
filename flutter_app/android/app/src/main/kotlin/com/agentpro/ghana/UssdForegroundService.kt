package com.agentpro.ghana

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * A brief, user-perceptible foreground service shown only while a USSD
 * automation session is actively running (from the moment the dial
 * fires until the session ends). This protects the accessibility
 * service's process from being killed by the OS mid-transaction,
 * without requesting REQUEST_IGNORE_BATTERY_OPTIMIZATIONS - Play Store
 * restricts that permission to a fixed list of app categories (VoIP,
 * navigation, fitness, etc.) that this app doesn't fit, and there's a
 * documented precedent of apps with a comparably strong case getting
 * rejected for using it.
 *
 * Uses the "shortService" foreground service type (Android 14+),
 * purpose-built for exactly this kind of brief, user-initiated task -
 * capped at 3 minutes by the OS on Android 15+, comfortably longer
 * than any real USSD session. If an agent takes unusually long
 * entering their PIN and the OS times this out, it just degrades back
 * to normal background behavior for that one session - the existing
 * manual "Confirm Transaction" fallback already covers that edge case.
 * On Android 8-13, foreground service types aren't enforced this way,
 * so the service just starts normally there.
 */
class UssdForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "ussd_automation_progress"
        private const val NOTIFICATION_ID = 4821

        fun start(context: Context) {
            val intent = Intent(context, UssdForegroundService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, UssdForegroundService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannelIfNeeded()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Agent Pro Ghana")
            .setContentText("Processing your transaction — please wait")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // All setup happens in onCreate(); the service is stopped
        // explicitly via stop() when the USSD session ends.
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        // Android 15+ shortService 3-minute cap. Stop cleanly rather
        // than letting the system force-kill it - degrades gracefully
        // to normal background behavior for that one long-running
        // session instead of crashing.
        stopSelf()
    }

    private fun createChannelIfNeeded() {
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Transaction Processing",
                NotificationManager.IMPORTANCE_LOW
            )
            channel.description = "Shows while a USSD transaction is actively being processed"
            manager.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
