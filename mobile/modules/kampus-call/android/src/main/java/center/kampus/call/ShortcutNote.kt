package center.kampus.call

import android.content.Context

/**
 * The note the app leaves on the device for Gemini (A-274): who is signed in,
 * the coming lessons and the homework that waits, as the JSON text JavaScript
 * wrote (`src/features/shortcuts/snapshot.ts`). It holds names and hours only,
 * never a sign-in token, and is removed at sign-out. It lives in the app's own
 * settings store, which no other app can read.
 */
object ShortcutNote {
  private const val FILE = "kampus.shortcuts"
  private const val KEY = "note"

  fun save(context: Context, json: String?) {
    val editor = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
    if (json == null) editor.remove(KEY) else editor.putString(KEY, json)
    editor.apply()
  }

  /** The note's text, or null when nobody is signed in on this device. */
  fun read(context: Context): String? =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)
}
