package app.ieltsvocab.widget

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import app.ieltsvocab.MainActivity
import app.ieltsvocab.R

/**
 * 桌面小组件使用的后台播放服务：不依赖 JS 运行时，App 没打开也能放正文音频。
 * 通过系统音频焦点和 App 内的 expo-audio 播放器互斥，不会两边同时出声。
 */
class PlaybackService : Service() {

  companion object {
    const val ACTION_TOGGLE = "app.ieltsvocab.widget.TOGGLE"
    const val ACTION_NEXT = "app.ieltsvocab.widget.NEXT"
    const val ACTION_PREV = "app.ieltsvocab.widget.PREV"
    const val ACTION_STOP = "app.ieltsvocab.widget.STOP"

    private const val CHANNEL_ID = "sixty_widget_playback"
    private const val NOTIFICATION_ID = 6001

    fun pendingIntent(context: Context, action: String): PendingIntent {
      val intent = Intent(context, PlaybackService::class.java).setAction(action)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        PendingIntent.getForegroundService(context, action.hashCode(), intent, flags)
      } else {
        PendingIntent.getService(context, action.hashCode(), intent, flags)
      }
    }

    fun openAppIntent(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }

  private var player: MediaPlayer? = null
  private var focusRequest: AudioFocusRequest? = null
  private lateinit var audioManager: AudioManager

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> pause()
      else -> Unit
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // 前台服务必须尽快挂上通知，否则系统会杀掉服务
    goForeground()
    when (intent?.action) {
      ACTION_TOGGLE -> toggle()
      ACTION_NEXT -> skip(+1)
      ACTION_PREV -> skip(-1)
      ACTION_STOP -> {
        releasePlayer()
        setPlaying(false)
        stopForegroundCompat()
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    releasePlayer()
    abandonFocus()
    WidgetState.setPlaying(this, false)
    LessonWidgets.updateAll(this)
    super.onDestroy()
  }

  // ---------- 播放控制 ----------

  private fun currentArticle(): LessonArticle? {
    val list = ArticleCatalog.load(this)
    if (list.isEmpty()) return null
    return list[WidgetState.currentIndex(this)]
  }

  private fun toggle() {
    val p = player
    if (p == null) {
      startCurrent()
    } else if (p.isPlaying) {
      pause()
    } else {
      resume()
    }
  }

  private fun skip(delta: Int) {
    val list = ArticleCatalog.load(this)
    if (list.isEmpty()) return
    val next = ((WidgetState.currentIndex(this) + delta) % list.size + list.size) % list.size
    WidgetState.setIndex(this, next)
    startCurrent()
  }

  private fun startCurrent() {
    val article = currentArticle() ?: return
    releasePlayer()
    if (!requestFocus()) return

    val mp = MediaPlayer()
    try {
      val afd = assets.openFd(article.audioAssetPath)
      try {
        mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
      } finally {
        afd.close()
      }
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
      mp.setOnCompletionListener { onCompleted() }
      mp.setOnErrorListener { _, _, _ ->
        releasePlayer()
        setPlaying(false)
        true
      }
      mp.prepare()
      mp.start()
      player = mp
      setPlaying(true)
    } catch (e: Exception) {
      mp.release()
      player = null
      setPlaying(false)
    }
  }

  private fun pause() {
    val p = player ?: return
    try {
      if (p.isPlaying) p.pause()
    } catch (e: IllegalStateException) {
      // 已释放
    }
    setPlaying(false)
  }

  private fun resume() {
    val p = player ?: return startCurrent()
    if (!requestFocus()) return
    try {
      p.start()
      setPlaying(true)
    } catch (e: IllegalStateException) {
      startCurrent()
    }
  }

  private fun onCompleted() {
    releasePlayer()
    setPlaying(false)
    stopForegroundCompat()
    stopSelf()
  }

  private fun releasePlayer() {
    player?.let {
      try {
        it.stop()
      } catch (e: IllegalStateException) {
        // 未开始或已释放
      }
      it.release()
    }
    player = null
  }

  private fun setPlaying(playing: Boolean) {
    WidgetState.setPlaying(this, playing)
    LessonWidgets.updateAll(this)
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIFICATION_ID, buildNotification())
  }

  // ---------- 音频焦点 ----------

  private fun requestFocus(): Boolean {
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val req = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        .setOnAudioFocusChangeListener(focusListener)
        .build()
        .also { focusRequest = it }
      audioManager.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        focusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN,
      )
    }
    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusListener)
    }
  }

  // ---------- 前台服务 / 通知 ----------

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "桌面小组件播放",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "雅思词汇小组件后台播放课文时显示的控制通知"
      setShowBadge(false)
    }
    nm.createNotificationChannel(channel)
  }

  private fun goForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun buildNotification(): Notification {
    val article = currentArticle()
    val playing = WidgetState.isPlaying(this)
    val title = article?.let { String.format("%02d  %s", it.number, it.title) } ?: "雅思词汇"

    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }

    return builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(if (playing) "正在播放 · 雅思词汇" else "已暂停 · 雅思词汇")
      .setContentIntent(openAppIntent(this))
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, android.R.drawable.ic_media_previous),
          "上一篇",
          pendingIntent(this, ACTION_PREV),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play),
          if (playing) "暂停" else "播放",
          pendingIntent(this, ACTION_TOGGLE),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, android.R.drawable.ic_media_next),
          "下一篇",
          pendingIntent(this, ACTION_NEXT),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
          "停止",
          pendingIntent(this, ACTION_STOP),
        ).build(),
      )
      .build()
  }
}
