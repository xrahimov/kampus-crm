import Foundation
internal import ExpoAppIntents

/// The note the app leaves on the device for Siri (see `src/features/shortcuts`):
/// who is signed in, the coming lessons and the homework that waits. It holds
/// names and hours only. No note means nobody is signed in.
struct KampusLesson: Sendable {
  let title: String
  let place: String?
  let startsAt: Date
  let endsAt: Date
  let live: Bool
}

struct KampusTask: Sendable {
  let title: String
  /// The day the answer is due, as the server writes it ("2026-11-28").
  let due: String?
}

struct KampusNote: Sendable {
  /// "staff" or "student".
  let kind: String
  /// The language the person chose in the app: "uz", "ru" or "en".
  let language: String
  let savedAt: Date
  let lessons: [KampusLesson]
  let tasks: [KampusTask]
  /// A teacher's count of answers to check; nil when the app did not learn it.
  let toCheck: Int?

  static func read() async -> KampusNote? {
    let store = AppIntentEntityStore.shared
    guard let who = (try? await store.entities(ofKind: "who"))?.first else { return nil }
    let lessons = ((try? await store.entities(ofKind: "lesson")) ?? []).compactMap(lesson)
    let tasks = ((try? await store.entities(ofKind: "homework")) ?? []).map {
      KampusTask(title: $0.title, due: $0.metadata["due"])
    }
    let language = who.metadata["locale"] ?? KampusWords.deviceLanguage
    return KampusNote(
      kind: who.id,
      language: KampusWords.languages.contains(language) ? language : "en",
      savedAt: moment(who.metadata["savedAt"]) ?? Date.distantPast,
      lessons: lessons.sorted { $0.startsAt < $1.startsAt },
      tasks: tasks,
      toCheck: who.metadata["toCheck"].flatMap { Int($0) }
    )
  }

  private static func lesson(_ record: AppIntentEntityRecord) -> KampusLesson? {
    guard let startsAt = moment(record.metadata["startsAt"]),
      let endsAt = moment(record.metadata["endsAt"])
    else { return nil }
    return KampusLesson(
      title: record.title,
      place: record.subtitle,
      startsAt: startsAt,
      endsAt: endsAt,
      live: record.metadata["live"] == "1"
    )
  }

  /// JavaScript writes moments as milliseconds since 1970.
  private static func moment(_ text: String?) -> Date? {
    guard let text, let milliseconds = Double(text) else { return nil }
    return Date(timeIntervalSince1970: milliseconds / 1000)
  }
}
