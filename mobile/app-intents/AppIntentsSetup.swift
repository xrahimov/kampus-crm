internal import ExpoAppIntents
internal import ExpoModulesCore

/// Connects the Siri shortcuts in this folder to `expo-app-intents` (A-273).
/// The folder is compiled into the app itself, not into a library: Apple reads
/// the shortcuts out of the app at build time and does not look inside libraries.
/// Do not change the name of this class.
final class AppIntentsSetup: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("AppIntentsSetup")

    OnCreate {
      // The names JavaScript uses when the person does the same thing by hand,
      // so the iPhone can suggest the shortcut at the hours they usually do it.
      AppIntentDonationRegistry.shared.register("nextLesson", as: NextLessonIntent.self)
      AppIntentDonationRegistry.shared.register("startLesson", as: StartLessonIntent.self)
      AppIntentDonationRegistry.shared.register("homework", as: HomeworkIntent.self)

      Task {
        await AppIntentDispatcher.shared.setShortcutsRefreshHandler {
          AppShortcuts.updateAppShortcutParameters()
        }
        AppShortcuts.updateAppShortcutParameters()
      }
    }
  }
}
