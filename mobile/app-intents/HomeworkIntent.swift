import AppIntents
internal import ExpoAppIntents

/// "My homework in Kampus": a student hears which tasks wait for an answer, a
/// teacher how many answers wait to be checked. Answered from the note on the
/// device, without opening the app.
struct HomeworkIntent: AppIntent {
  static let title: LocalizedStringResource = "My homework"
  static let description = IntentDescription(
    "Says what homework is waiting, or how many answers wait to be checked."
  )
  static let openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let answer = KampusAnswers.homework(await KampusNote.read())
    return .result(dialog: IntentDialog(stringLiteral: answer))
  }
}

extension HomeworkIntent: DonatableAppIntent {}
