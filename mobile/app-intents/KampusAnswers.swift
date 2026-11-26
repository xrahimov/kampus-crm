import Foundation

/// What Siri answers, worked out from the note (A-273). Nothing here opens the
/// app or uses the network.
enum KampusAnswers {
  /// After this long without the app being opened, "no lessons" may only mean
  /// that the note is old, and Siri says so instead.
  private static let noteLifetime: TimeInterval = 12 * 3600

  static func nextLesson(_ note: KampusNote?, now: Date) -> String {
    guard let note else {
      return KampusWords.say("signedOut", KampusWords.deviceLanguage)
    }
    let language = note.language
    guard let lesson = note.lessons.first(where: { $0.endsAt > now }) else {
      let old = now.timeIntervalSince(note.savedAt) > noteLifetime
      return KampusWords.say(old ? "stale" : "noLessons", language)
    }
    if lesson.live || lesson.startsAt <= now {
      return KampusWords.say(
        "onNow", language,
        ["title": lesson.title, "time": KampusWords.clock(lesson.endsAt)]
      )
    }
    let when = KampusWords.when(lesson.startsAt, language, now: now)
    if let place = lesson.place, !place.isEmpty {
      return KampusWords.say(
        "nextPlace", language,
        ["title": lesson.title, "when": when, "place": place]
      )
    }
    return KampusWords.say("next", language, ["title": lesson.title, "when": when])
  }

  static func homework(_ note: KampusNote?) -> String {
    guard let note else {
      return KampusWords.say("signedOut", KampusWords.deviceLanguage)
    }
    let language = note.language
    if note.kind == "staff" {
      let count = note.toCheck ?? 0
      if count == 0 { return KampusWords.say("toCheckNone", language) }
      return KampusWords.say(
        "toCheck" + KampusWords.plural(count, language), language,
        ["count": String(count)]
      )
    }
    guard let first = note.tasks.first else {
      return KampusWords.say("noHomework", language)
    }
    if note.tasks.count == 1 {
      if let due = first.due, let day = KampusWords.day(iso: due, language) {
        return KampusWords.say("homeworkOneDue", language, ["title": first.title, "day": day])
      }
      return KampusWords.say("homeworkOne", language, ["title": first.title])
    }
    // Two or more: Russian still tells "2 задания" from "5 заданий".
    let wording = KampusWords.plural(note.tasks.count, language) == "Few" ? "Few" : "Many"
    return KampusWords.say(
      "homework" + wording, language,
      ["count": String(note.tasks.count), "title": first.title]
    )
  }
}
