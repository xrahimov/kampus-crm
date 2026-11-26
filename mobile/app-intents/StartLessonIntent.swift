import AppIntents
internal import ExpoAppIntents

/// "Start my lesson in Kampus": opens the app on the lesson that is on or comes
/// next. Which lesson that is, the app asks the server when it opens; this code
/// only passes the wish on.
struct StartLessonIntent: AppIntent {
  static let title: LocalizedStringResource = "Start my lesson"
  static let description = IntentDescription("Opens your current or next lesson in Kampus.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard let note = await KampusNote.read() else {
      // Nobody is signed in: the app opens on its sign-in screen.
      let words = KampusWords.say("signedOut", KampusWords.deviceLanguage)
      return .result(dialog: IntentDialog(stringLiteral: words))
    }
    await AppIntentDispatcher.shared.dispatch(
      name: "open",
      params: ["what": .string("start-lesson")]
    )
    let words = KampusWords.say("openingLesson", note.language)
    return .result(dialog: IntentDialog(stringLiteral: words))
  }
}

extension StartLessonIntent: DonatableAppIntent {}
