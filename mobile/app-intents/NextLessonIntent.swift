import AppIntents
internal import ExpoAppIntents

/// "My next lesson in Kampus": answered by voice from the note the app left on
/// the device, without opening the app and without the network.
struct NextLessonIntent: AppIntent {
  static let title: LocalizedStringResource = "My next lesson"
  static let description = IntentDescription("Says which lesson comes next and when.")
  static let openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let answer = KampusAnswers.nextLesson(await KampusNote.read(), now: Date())
    return .result(dialog: IntentDialog(stringLiteral: answer))
  }
}

extension NextLessonIntent: DonatableAppIntent {}
