package center.kampus.call

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What the app's JavaScript may ask for: start and stop the lesson's foreground service. */
class KampusCallModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KampusCall")

    Function("start") { title: String, text: String, channel: String ->
      val context = appContext.reactContext
      if (context == null) false else CallService.start(context, title, text, channel)
    }

    Function("stop") {
      val context = appContext.reactContext
      if (context == null) false else CallService.stop(context)
    }

    OnDestroy {
      appContext.reactContext?.let { CallService.stop(it) }
    }
  }
}
