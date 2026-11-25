package app.ieltsvocab.widget

import android.content.Context
import org.json.JSONObject

/** 小组件需要的最小文章信息 */
data class LessonArticle(
  val id: String,
  val number: Int,
  val title: String,
  /** 相对 android assets 根目录的路径，如 audio/01-The-Lost-Key/01-The-Lost-Key.mp3 */
  val audioAssetPath: String,
)

/**
 * 从打包进 APK 的 assets/articles.json 读取文章目录。
 * 该文件由 scripts/sync-android-audio.js 从项目 assets/ 复制而来，和 JS 端用的是同一份数据。
 */
object ArticleCatalog {
  @Volatile private var cache: List<LessonArticle>? = null

  fun load(context: Context): List<LessonArticle> {
    cache?.let { return it }
    val list = try {
      val json = context.assets.open("articles.json").bufferedReader().use { it.readText() }
      val arr = JSONObject(json).getJSONArray("articles")
      ArrayList<LessonArticle>(arr.length()).also { out ->
        for (i in 0 until arr.length()) {
          val o = arr.getJSONObject(i)
          out.add(
            LessonArticle(
              id = o.getString("id"),
              number = o.getInt("number"),
              title = o.getString("title"),
              audioAssetPath = o.getString("bodyAudio").removePrefix("assets/"),
            ),
          )
        }
      }
    } catch (e: Exception) {
      emptyList()
    }
    cache = list
    return list
  }

  fun indexOf(context: Context, id: String?): Int {
    if (id == null) return -1
    return load(context).indexOfFirst { it.id == id }
  }
}
