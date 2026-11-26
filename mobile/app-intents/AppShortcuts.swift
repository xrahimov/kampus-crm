import AppIntents

/// What a person can say to Siri without setting anything up (A-273).
///
/// The phrases are compiled into the app. The English ones are here; the Russian
/// ones are in `plugins/voice/siri-phrases.ru.json` and become `AppShortcuts.strings`
/// when the iOS project is generated. A test keeps the two in step. Siri does not
/// understand Uzbek, so there are no Uzbek phrases; the titles and the answers
/// do have Uzbek wording.
///
/// Apple's rules: every phrase names the app, and an app has at most ten shortcuts.
struct AppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: NextLessonIntent(),
      phrases: [
        "My next lesson in \(.applicationName)",
        "Next lesson in \(.applicationName)",
        "When is my next lesson in \(.applicationName)",
      ],
      shortTitle: "My next lesson",
      systemImageName: "calendar.badge.clock"
    )
    AppShortcut(
      intent: StartLessonIntent(),
      phrases: [
        "Start my lesson in \(.applicationName)",
        "Join my lesson in \(.applicationName)",
        "Open my lesson in \(.applicationName)",
      ],
      shortTitle: "Start my lesson",
      systemImageName: "video"
    )
    AppShortcut(
      intent: HomeworkIntent(),
      phrases: [
        "My homework in \(.applicationName)",
        "Homework in \(.applicationName)",
        "Check homework in \(.applicationName)",
      ],
      shortTitle: "My homework",
      systemImageName: "checklist"
    )
  }
}
