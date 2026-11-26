/*
 * Shortcuts into the app from outside it (A-273): Siri on an iPhone or iPad,
 * and the list that opens when the app's picture is held down on an Android
 * home screen. The actions themselves are code (`app-intents/` for Siri); here
 * the generated native projects get the words and pictures that go with them.
 *
 * iPhone and iPad:
 * - `Kampus.strings` per language: the sentences Siri answers with, from the
 *   app's message files (`mobile.shortcuts.say`).
 * - `AppShortcuts.strings`: what a person says to Siri in a language other than
 *   English. The English phrases are in `app-intents/AppShortcuts.swift`.
 * (The shortcuts' titles are translated through `locales` in app.config.ts.)
 *
 * Android: three shortcuts under the app's picture. Each opens a link,
 * `kampus://shortcut/<wish>`, which the app turns into the right screen.
 */
const fs = require("fs");
const path = require("path");

const {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require("expo/config-plugins");

/** The wishes, in the order Android lists them, with the message key of each one's name. */
const SHORTCUTS = [
  { id: "start_lesson", wish: "start-lesson", label: "startLesson", icon: "video" },
  { id: "next_lesson", wish: "next-lesson", label: "nextLesson", icon: "next" },
  { id: "homework", wish: "homework", label: "homework", icon: "homework" },
];

const LAPIS = "#FF17234B";
const TURQUOISE = "#FF58D4D0";

/** The app's own line drawings (24 by 24, drawn with a 2-wide round line). */
const GLYPHS = {
  video: [
    "M4,6h10a2,2 0,0 1,2 2v8a2,2 0,0 1,-2 2H4a2,2 0,0 1,-2 -2V8a2,2 0,0 1,2 -2z",
    "M16,13l5.223,3.482a0.5,0.5 0,0 0,0.777 -0.416V7.87a0.5,0.5 0,0 0,-0.752 -0.432L16,10.5",
  ],
  next: [
    "M21,7.5V6a2,2 0,0 0,-2 -2H5a2,2 0,0 0,-2 2v14a2,2 0,0 0,2 2h3.5",
    "M16,2v4",
    "M8,2v4",
    "M3,10h5",
    "M17.5,17.5L16,16.3V14",
    "M22,16a6,6 0,1 1,-12 0a6,6 0,0 1,12 0z",
  ],
  homework: ["M3,17l2,2l4,-4", "M3,7l2,2l4,-4", "M13,6h8", "M13,12h8", "M13,18h8"],
};

function strokes(glyph) {
  return GLYPHS[glyph]
    .map(
      (data) => `        <path
            android:fillColor="#00000000"
            android:strokeColor="${LAPIS}"
            android:strokeWidth="2"
            android:strokeLineCap="round"
            android:strokeLineJoin="round"
            android:pathData="${data}" />`,
    )
    .join("\n");
}

/** The drawing alone, for the Android versions that have no shaped pictures. */
function plainIcon(glyph) {
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <group>
${strokes(glyph)}
    </group>
</vector>
`;
}

/** The drawing in the middle of a 108 by 108 sheet, as a shaped picture's front layer needs it. */
function frontLayer(glyph) {
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="2"
        android:scaleY="2"
        android:translateX="30"
        android:translateY="30">
${strokes(glyph)}
    </group>
</vector>
`;
}

function shapedIcon(glyph) {
  return `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/kampus_shortcut_background" />
    <foreground android:drawable="@drawable/kampus_shortcut_${glyph}_front" />
</adaptive-icon>
`;
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function labels(words) {
  const lines = SHORTCUTS.map(
    (s) => `    <string name="kampus_shortcut_${s.id}">${escapeXml(words[s.label])}</string>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
${lines.join("\n")}
</resources>
`;
}

function shortcutsXml(packageName) {
  const items = SHORTCUTS.map(
    (s) => `    <shortcut
        android:shortcutId="${s.id}"
        android:enabled="true"
        android:icon="@drawable/kampus_shortcut_${s.icon}"
        android:shortcutShortLabel="@string/kampus_shortcut_${s.id}"
        android:shortcutLongLabel="@string/kampus_shortcut_${s.id}">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="${packageName}"
            android:targetClass="${packageName}.MainActivity"
            android:data="kampus://shortcut/${s.wish}" />
    </shortcut>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items.join("\n")}
</shortcuts>
`;
}

const COLORS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="kampus_shortcut_background">${TURQUOISE}</color>
</resources>
`;

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function withHomeScreenFiles(config, words) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const packageName = config.android && config.android.package;
      if (!packageName) throw new Error("with-voice-shortcuts: android.package is not set");
      const res = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res");
      write(path.join(res, "xml/kampus_shortcuts.xml"), shortcutsXml(packageName));
      write(path.join(res, "values/kampus_shortcut_colors.xml"), COLORS);
      for (const glyph of Object.keys(GLYPHS)) {
        write(path.join(res, `drawable/kampus_shortcut_${glyph}.xml`), plainIcon(glyph));
        write(path.join(res, `drawable/kampus_shortcut_${glyph}_front.xml`), frontLayer(glyph));
        write(path.join(res, `drawable-v26/kampus_shortcut_${glyph}.xml`), shapedIcon(glyph));
      }
      for (const [locale, text] of Object.entries(words)) {
        const folder = locale === "en" ? "values" : `values-b+${locale}`;
        write(path.join(res, folder, "kampus_shortcuts.xml"), labels(text));
      }
      return mod;
    },
  ]);
}

const SHORTCUTS_KEY = "android.app.shortcuts";

/** The app's first screen tells Android where its list of shortcuts is. */
function withHomeScreenList(config) {
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const others = (activity["meta-data"] || []).filter(
      (entry) => entry.$["android:name"] !== SHORTCUTS_KEY,
    );
    activity["meta-data"] = [
      ...others,
      { $: { "android:name": SHORTCUTS_KEY, "android:resource": "@xml/kampus_shortcuts" } },
    ];
    return mod;
  });
}

/** Per language: what Siri answers with. English too, so a missing wording falls back to it. */
function sentences(words) {
  const tables = {};
  for (const [locale, text] of Object.entries(words)) tables[locale] = { ...text.say };
  return tables;
}

function withSiriWords(config, words, phrases) {
  return withXcodeProject(config, async (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const supportingDirectory = path.join(
      mod.modRequest.platformProjectRoot,
      projectName,
      "Supporting",
    );
    const common = { supportingDirectory, projectName };
    mod.modResults = await IOSConfig.Locales.writeStringsFile({
      ...common,
      localesMap: sentences(words),
      fileName: "Kampus.strings",
      project: mod.modResults,
    });
    mod.modResults = await IOSConfig.Locales.writeStringsFile({
      ...common,
      localesMap: phrases,
      fileName: "AppShortcuts.strings",
      project: mod.modResults,
    });
    return mod;
  });
}

/**
 * @param words per language (`en`, `ru`, `uz`): `mobile.shortcuts` of the message files.
 * @param phrases per language other than English: what is said to Siri, by its English phrase.
 */
module.exports = function withVoiceShortcuts(config, { words, phrases }) {
  config = withHomeScreenList(withHomeScreenFiles(config, words));
  return withSiriWords(config, words, phrases);
};
module.exports.shortcutsXml = shortcutsXml;
module.exports.labels = labels;
module.exports.sentences = sentences;
module.exports.SHORTCUTS = SHORTCUTS;
