package app.ieltsvocab.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import app.ieltsvocab.R

/** 构建/刷新两种尺寸小组件的公共逻辑 */
object LessonWidgets {

  /** 播放状态或当前文章变化后，刷新桌面上所有已添加的小组件 */
  fun updateAll(context: Context) {
    val mgr = AppWidgetManager.getInstance(context)
    val largeIds = mgr.getAppWidgetIds(ComponentName(context, LessonWidgetLarge::class.java))
    val smallIds = mgr.getAppWidgetIds(ComponentName(context, LessonWidgetSmall::class.java))
    if (largeIds.isNotEmpty()) {
      val views = buildViews(context, large = true)
      for (id in largeIds) mgr.updateAppWidget(id, views)
    }
    if (smallIds.isNotEmpty()) {
      val views = buildViews(context, large = false)
      for (id in smallIds) mgr.updateAppWidget(id, views)
    }
  }

  fun buildViews(context: Context, large: Boolean): RemoteViews {
    val layout = if (large) R.layout.widget_lesson_large else R.layout.widget_lesson_small
    val views = RemoteViews(context.packageName, layout)

    val list = ArticleCatalog.load(context)
    val article = list.getOrNull(WidgetState.currentIndex(context))
    val playing = WidgetState.isPlaying(context)

    views.setTextViewText(
      R.id.widget_number,
      article?.let { String.format("%02d", it.number) } ?: "--",
    )
    views.setTextViewText(R.id.widget_title, article?.title ?: "雅思词汇")
    views.setImageViewResource(
      R.id.widget_toggle,
      if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
    )
    views.setContentDescription(R.id.widget_toggle, if (playing) "暂停" else "播放")

    views.setOnClickPendingIntent(
      R.id.widget_toggle,
      PlaybackService.pendingIntent(context, PlaybackService.ACTION_TOGGLE),
    )
    views.setOnClickPendingIntent(R.id.widget_title_area, PlaybackService.openAppIntent(context))

    if (large) {
      views.setOnClickPendingIntent(
        R.id.widget_prev,
        PlaybackService.pendingIntent(context, PlaybackService.ACTION_PREV),
      )
      views.setOnClickPendingIntent(
        R.id.widget_next,
        PlaybackService.pendingIntent(context, PlaybackService.ACTION_NEXT),
      )
    }
    return views
  }
}

abstract class LessonWidgetProvider(private val large: Boolean) : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val views = LessonWidgets.buildViews(context, large)
    for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, views)
  }
}

/** 4×1：上一篇 / 播放暂停 / 下一篇 + 当前课文 */
class LessonWidgetLarge : LessonWidgetProvider(large = true)

/** 2×1：播放暂停 + 当前课文 */
class LessonWidgetSmall : LessonWidgetProvider(large = false)
