import Foundation

/// The sentences Siri says, in the language the person chose in the app (A-273).
/// They come from the app's own message files (`messages/*.json`, the key
/// `mobile.shortcuts.say`), written into `Kampus.strings` for each language when
/// the iOS project is generated. `{name}` marks a value put in here.
enum KampusWords {
  static let languages = ["uz", "ru", "en"]

  /// The phone's own language when Kampus speaks it; English otherwise.
  static var deviceLanguage: String {
    for tag in Locale.preferredLanguages {
      let code = String(tag.prefix(2)).lowercased()
      if languages.contains(code) { return code }
    }
    return "en"
  }

  static func say(_ key: String, _ language: String, _ values: [String: String] = [:]) -> String {
    var text = table(language).localizedString(forKey: key, value: nil, table: "Kampus")
    if text == key {
      text = table("en").localizedString(forKey: key, value: key, table: "Kampus")
    }
    for (name, value) in values {
      text = text.replacingOccurrences(of: "{\(name)}", with: value)
    }
    return text
  }

  /// Which of three wordings a number takes. Russian has three; English and
  /// Uzbek get by with fewer and repeat a wording.
  static func plural(_ count: Int, _ language: String) -> String {
    if language == "ru" {
      let ones = count % 10
      let tens = count % 100
      if ones == 1 && tens != 11 { return "One" }
      if (2...4).contains(ones) && !(12...14).contains(tens) { return "Few" }
      return "Many"
    }
    return count == 1 ? "One" : "Many"
  }

  /// "19:30", in the phone's own clock.
  static func clock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
  }

  /// "Thursday 27 November", spelled in the person's language.
  static func day(_ date: Date, _ language: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = locale(language)
    formatter.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
    return formatter.string(from: date)
  }

  /// A day the server wrote ("2026-11-28") is a day in the centre's calendar:
  /// noon in Tashkent falls on that same day in every time zone a student lives in.
  static func day(iso: String, _ language: String) -> String? {
    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: "\(iso.prefix(10))T12:00:00+05:00") else { return nil }
    let formatter = DateFormatter()
    formatter.locale = locale(language)
    formatter.setLocalizedDateFormatFromTemplate("dMMMM")
    return formatter.string(from: date)
  }

  /// "today at 19:30", "tomorrow at 19:30", "Thursday 27 November at 19:30".
  static func when(_ date: Date, _ language: String, now: Date) -> String {
    let calendar = Calendar.current
    let time = clock(date)
    if calendar.isDate(date, inSameDayAs: now) {
      return say("today", language, ["time": time])
    }
    if let tomorrow = calendar.date(byAdding: .day, value: 1, to: now),
      calendar.isDate(date, inSameDayAs: tomorrow)
    {
      return say("tomorrow", language, ["time": time])
    }
    return say("onDay", language, ["day": day(date, language), "time": time])
  }

  private static func locale(_ language: String) -> Locale {
    switch language {
    case "ru": return Locale(identifier: "ru_RU")
    case "uz": return Locale(identifier: "uz_Latn_UZ")
    default: return Locale(identifier: "en_GB")
    }
  }

  private static func table(_ language: String) -> Bundle {
    guard let path = Bundle.main.path(forResource: language, ofType: "lproj"),
      let bundle = Bundle(path: path)
    else { return Bundle.main }
    return bundle
  }
}
