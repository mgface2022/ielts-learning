package app.ieltsvocab.widget

import android.content.Context
import android.database.sqlite.SQLiteDatabase

/**
 * 小组件的本地状态（SharedPreferences）。
 *
 * 当前文章的选择规则：
 *  - App 内最后打开的文章（AsyncStorage 的 sixty.lastId）变化时，小组件跟随切到那篇；
 *  - 否则沿用用户在小组件里用上一篇/下一篇选到的位置。
 */
object WidgetState {
  private const val PREFS = "sixty.widget"
  private const val KEY_INDEX = "index"
  private const val KEY_PLAYING = "playing"
  private const val KEY_SYNCED_LAST_ID = "syncedLastId"

  // AsyncStorage（@react-native-async-storage）在 Android 上的 SQLite 存储
  private const val RN_DB = "RKStorage"
  private const val RN_TABLE = "catalystLocalStorage"
  private const val APP_LAST_ID_KEY = "sixty.lastId"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** 读取 App 内最后打开的文章 id；读不到返回 null */
  private fun readAppLastId(context: Context): String? {
    val dbFile = context.getDatabasePath(RN_DB)
    if (!dbFile.exists()) return null
    return try {
      SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
        db.query(RN_TABLE, arrayOf("value"), "key = ?", arrayOf(APP_LAST_ID_KEY), null, null, null)
          .use { c -> if (c.moveToFirst()) c.getString(0) else null }
      }
    } catch (e: Exception) {
      null
    }
  }

  /** 当前文章下标（已和 App 内进度同步，并限定在有效范围内） */
  fun currentIndex(context: Context): Int {
    val size = ArticleCatalog.load(context).size
    if (size == 0) return 0
    val p = prefs(context)
    val appLastId = readAppLastId(context)
    if (appLastId != null && appLastId != p.getString(KEY_SYNCED_LAST_ID, null)) {
      val idx = ArticleCatalog.indexOf(context, appLastId)
      p.edit()
        .putString(KEY_SYNCED_LAST_ID, appLastId)
        .apply {
          if (idx >= 0) putInt(KEY_INDEX, idx)
        }
        .apply()
    }
    return p.getInt(KEY_INDEX, 0).coerceIn(0, size - 1)
  }

  fun setIndex(context: Context, index: Int) {
    prefs(context).edit().putInt(KEY_INDEX, index).apply()
  }

  fun isPlaying(context: Context): Boolean = prefs(context).getBoolean(KEY_PLAYING, false)

  fun setPlaying(context: Context, playing: Boolean) {
    prefs(context).edit().putBoolean(KEY_PLAYING, playing).apply()
  }
}
