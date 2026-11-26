import en from "@kampus/messages/en.json";
import ru from "@kampus/messages/ru.json";
import uz from "@kampus/messages/uz.json";

// Node's own file reading, typed here because the app's code has no Node types.
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as {
  readFileSync: (file: string, encoding: "utf8") => string;
  readdirSync: (folder: string) => string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path") as { join: (...parts: string[]) => string };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("../with-voice-shortcuts") as {
  shortcutsXml: (packageName: string) => string;
  labels: (words: Record<string, unknown>) => string;
  sentences: (
    words: Record<string, { say: Record<string, string> }>,
  ) => Record<string, Record<string, string>>;
  SHORTCUTS: Array<{ id: string; wish: string; label: string; icon: string }>;
};
const russian = require("../voice/siri-phrases.ru.json") as Record<string, string>;

/*
 * The shortcuts' words (A-273) live in three places that a compiler does not
 * compare: Swift (what Siri listens for and how a shortcut is titled), a JSON
 * file (the same phrases in Russian) and the app's message files (titles and
 * answers in uz/ru/en). This test is what keeps them in step.
 */

const swift = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../../app-intents", name), "utf8");
const all = fs
  .readdirSync(path.join(__dirname, "../../app-intents"))
  .filter((name) => name.endsWith(".swift"))
  .map(swift)
  .join("\n");

const words = { en: en.mobile.shortcuts, ru: ru.mobile.shortcuts, uz: uz.mobile.shortcuts };

/** The phrases of `AppShortcuts.swift`, written as Apple's strings files key them. */
const spoken = [...swift("AppShortcuts.swift").matchAll(/^\s+"(.+\\\(\.applicationName\).*)",$/gm)]
  .map((match) => match[1] ?? "")
  .map((phrase) => phrase.replace("\\(.applicationName)", "${applicationName}"));

describe("what is said to Siri", () => {
  it("has three shortcuts with three phrases each, every one naming the app", () => {
    expect(spoken).toHaveLength(9);
    for (const phrase of spoken) expect(phrase).toContain("${applicationName}");
    expect(new Set(spoken).size).toBe(9);
  });

  it("has a Russian phrase for every English one, and none left over", () => {
    expect(Object.keys(russian).sort()).toEqual([...spoken].sort());
    for (const phrase of Object.values(russian)) expect(phrase).toContain("${applicationName}");
    expect(new Set(Object.values(russian)).size).toBe(9);
  });
});

describe("how a shortcut is titled", () => {
  // Apple translates a title by its English text: a title that differs from the
  // message file by one letter would stay English on a Russian phone.
  const pairs: Array<[file: string, title: string, about: string]> = [
    ["NextLessonIntent.swift", en.mobile.shortcuts.nextLesson, en.mobile.shortcuts.nextLessonAbout],
    [
      "StartLessonIntent.swift",
      en.mobile.shortcuts.startLesson,
      en.mobile.shortcuts.startLessonAbout,
    ],
    ["HomeworkIntent.swift", en.mobile.shortcuts.homework, en.mobile.shortcuts.homeworkAbout],
  ];

  it.each(pairs)("%s carries the English title and description", (file, title, about) => {
    const code = swift(file);
    expect(code).toContain(`static let title: LocalizedStringResource = "${title}"`);
    expect(code.replace(/\s+/g, " ")).toMatch(
      new RegExp(`IntentDescription\\( ?"${about.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}" ?\\)`),
    );
    expect(swift("AppShortcuts.swift")).toContain(`shortTitle: "${title}"`);
  });
});

describe("what Siri answers with", () => {
  const said = new Set<string>();
  for (const match of all.matchAll(/say\(\s*"([A-Za-z]+)"(\s*\+)?/g)) {
    if (match[2]) for (const ending of ["One", "Few", "Many"]) said.add(`${match[1]}${ending}`);
    else if (match[1]) said.add(match[1]);
  }
  for (const match of all.matchAll(/\? "([a-zA-Z]+)" : "([a-zA-Z]+)", language/g)) {
    if (match[1]) said.add(match[1]);
    if (match[2]) said.add(match[2]);
  }

  it("finds the sentences the Swift code asks for", () => {
    expect([...said].sort()).toEqual(
      [
        "homeworkFew",
        "homeworkMany",
        "homeworkOne",
        "homeworkOneDue",
        "next",
        "nextPlace",
        "noHomework",
        "noLessons",
        "onDay",
        "onNow",
        "openingLesson",
        "signedOut",
        "stale",
        "toCheckFew",
        "toCheckMany",
        "toCheckNone",
        "toCheckOne",
        "today",
        "tomorrow",
      ].sort(),
    );
  });

  it.each(["en", "ru", "uz"] as const)("has every sentence in %s, and no unused one", (locale) => {
    expect(Object.keys(words[locale].say).sort()).toEqual([...said].sort());
  });

  it("puts the same values into a sentence in every language", () => {
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, text] of Object.entries(words.en.say)) {
      for (const locale of ["ru", "uz"] as const) {
        expect([key, locale, holes(words[locale].say[key as keyof typeof words.en.say])]).toEqual([
          key,
          locale,
          holes(text),
        ]);
      }
    }
  });

  it("hands each language its own table, English included", () => {
    const tables = plugin.sentences(words);
    expect(Object.keys(tables).sort()).toEqual(["en", "ru", "uz"]);
    expect(tables.ru?.noLessons).toBe(ru.mobile.shortcuts.say.noLessons);
    expect(tables.en?.signedOut).toBe(en.mobile.shortcuts.say.signedOut);
  });
});

describe("the shortcuts under the app's picture on Android", () => {
  it("lists the three wishes as links into the app", () => {
    const xml = plugin.shortcutsXml("center.kampus.app");
    for (const wish of ["start-lesson", "next-lesson", "homework"]) {
      expect(xml).toContain(`android:data="kampus://shortcut/${wish}"`);
    }
    expect(xml.match(/<shortcut\b/g)).toHaveLength(3);
    expect(xml).toContain('android:targetClass="center.kampus.app.MainActivity"');
  });

  it("names each one from the message files, with apostrophes Android can read", () => {
    const xml = plugin.labels(words.uz);
    for (const shortcut of plugin.SHORTCUTS) {
      expect(xml).toContain(`<string name="kampus_shortcut_${shortcut.id}">`);
      expect(words.en[shortcut.label as "homework"]).toBeTruthy();
    }
    expect(xml).not.toMatch(/[^\\]'/);
    expect(plugin.labels({ ...words.en, homework: `Tom & "Jerry's"` })).toContain(
      `Tom &amp; \\"Jerry\\'s\\"`,
    );
  });
});
