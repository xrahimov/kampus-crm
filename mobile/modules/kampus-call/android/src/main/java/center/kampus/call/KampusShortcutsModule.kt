package center.kampus.call

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What the app's JavaScript may ask for: write the note for Gemini, or remove it. */
class KampusShortcutsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KampusShortcuts")

    Function("setSnapshot") { json: String? ->
      val context = appContext.reactContext
      if (context == null) {
        false
      } else {
        ShortcutNote.save(context, json)
        true
      }
    }
  }
}
