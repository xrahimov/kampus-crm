import { staffSnapshot } from "@/features/shortcuts/snapshot";

// Node's own file reading, typed here because the app's code has no Node types.
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as { readFileSync: (file: string, encoding: "utf8") => string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path") as { join: (...parts: string[]) => string };

interface Application {
  service?: Array<Record<string, unknown> & { $: Record<string, string> }>;
  property?: Array<{ $: Record<string, string> }>;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("../with-gemini-functions") as {
  addGeneratorPlugin: (gradle: string, version: string) => string;
  addLibrary: (gradle: string) => string;
  appMetadata: (instructions: string) => string;
  declareService: (application: Application) => Application;
  SERVICE: string;
  PACKAGE: string;
  FUNCTIONS_FILE: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const voice = require("../with-voice-shortcuts") as { SHORTCUTS: Array<{ wish: string }> };

/*
 * What Gemini can ask the app for (A-274). The Kotlin is compiled only when
 * the Android app is built; these tests hold together what no compiler
 * compares: the names the plugin writes into the manifest, the note's fields
 * as JavaScript writes them, and the code generator's version.
 */

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const kotlin = read("gemini/KampusFunctions.kt");

// The lines of Expo's template the plugin looks for.
const ROOT = `buildscript {
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    def kotlinVersion = findProperty('android.kotlinVersion')
    classpath(kotlinVersion ? "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion" : 'org.jetbrains.kotlin:kotlin-gradle-plugin')
  }
}
`;
const APP = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

dependencies {
    // The version of react-native is set by the React Native Gradle Plugin
    implementation("com.facebook.react:react-android")
}
`;

describe("the Gradle files", () => {
  it("get the code generator beside Kotlin, once", () => {
    const once = plugin.addGeneratorPlugin(ROOT, "2.2.0-2.0.2");
    expect(once).toContain(
      `'org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:2.2.0-2.0.2")\n`,
    );
    expect(plugin.addGeneratorPlugin(once, "2.2.0-2.0.2")).toBe(once);
  });

  it("get the library and its generator in the app, once", () => {
    const once = plugin.addLibrary(APP);
    expect(once).toContain(
      'apply plugin: "org.jetbrains.kotlin.android"\napply plugin: "com.google.devtools.ksp"\n',
    );
    expect(once).toContain('implementation("androidx.appfunctions:appfunctions:1.0.0")');
    expect(once).toContain('ksp("androidx.appfunctions:appfunctions-compiler:1.0.0")');
    expect(plugin.addLibrary(once)).toBe(once);
  });

  it("stop the build when Expo's template no longer has the lines", () => {
    expect(() => plugin.addGeneratorPlugin("buildscript {}", "1")).toThrow(/Kotlin classpath/);
    expect(() => plugin.addLibrary("dependencies {}")).toThrow(/Kotlin plugin/);
  });

  it("use the generator version Expo pairs with the app's Kotlin", () => {
    const expo = "../node_modules/expo-modules-autolinking/android/expo-gradle-plugin";
    const folder = `${expo}/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin`;
    const version = /defaultKotlinVersion = "([\d.]+)"/.exec(read(folder, "KotlinVersions.kt"));
    const paired = new RegExp(`"${version?.[1]}" to "([\\d.-]+)"`).exec(
      read(folder, "KSPLookup.kt"),
    );
    expect(paired?.[1]).toBeTruthy();
    expect(read("../app.config.ts")).toContain(`ksp: "${paired?.[1]}"`);
  });
});

describe("the manifest", () => {
  it("names the service the library generates from the Kotlin file", () => {
    expect(kotlin).toContain(`package ${plugin.PACKAGE}\n`);
    const name = /serviceName = "(\w+)"/.exec(kotlin)?.[1];
    expect(`${plugin.PACKAGE}.${name}`).toBe(plugin.SERVICE);
    const file = /appFunctionXmlFileName = "(\w+)"/.exec(kotlin)?.[1];
    expect(`${file}.xml`).toBe(plugin.FUNCTIONS_FILE);
  });

  it("declares it so that only Android itself can bind to it, and only once", () => {
    const application = plugin.declareService(plugin.declareService({}));
    expect(application.service).toHaveLength(1);
    expect(application.service?.[0]?.$).toEqual({
      "android:name": plugin.SERVICE,
      "android:permission": "android.permission.BIND_APP_FUNCTION_SERVICE",
      "android:exported": "true",
      "tools:targetApi": "36",
    });
    expect(application.property).toEqual([
      {
        $: {
          "android:name": "android.app.appfunctions.app_metadata",
          "android:resource": "@xml/kampus_app_metadata",
        },
      },
    ]);
  });

  it("writes what the app is for with marks XML can hold", () => {
    expect(plugin.appMetadata(`A centre's "app" & more`)).toContain(
      `appfn:instructions="A centre&apos;s &quot;app&quot; &amp; more"`,
    );
  });
});

describe("the Kotlin functions", () => {
  it("read the note's fields under the names JavaScript writes", () => {
    const note = staffSnapshot(
      {
        date: "2026-11-26",
        today: "2026-11-26",
        lessons: [],
        next: {
          id: "n1",
          groupId: "g1",
          groupName: "SAT",
          date: "2026-11-27",
          startTime: "20:00",
          endTime: "21:00",
          roomName: null,
        },
        debtors: [],
        debtorCount: 0,
        debtTotal: 0,
        canMark: true,
        canSeeBalances: false,
      },
      1,
      0,
    );
    const written = new Set([
      ...Object.keys(note),
      ...note.lessons.flatMap((lesson) => Object.keys(lesson)),
      // A task's fields, which a teacher's note has none of.
      "title",
      "due",
    ]);
    const asked = [...kotlin.matchAll(/(?:get\w+|isNull|optBoolean)\("(\w+)"/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(8);
    for (const field of asked) expect([field, written.has(field ?? "")]).toEqual([field, true]);
  });

  it("read the note from where the app's own module keeps it", () => {
    const store = read(
      "../modules/kampus-call/android/src/main/java/center/kampus/call/ShortcutNote.kt",
    );
    for (const constant of ["FILE", "KEY"]) {
      const value = new RegExp(`const val ${constant} = "([\\w.]+)"`);
      expect(value.exec(kotlin)?.[1]).toBe(value.exec(store)?.[1]);
    }
  });

  it("open a lesson through a link the app knows", () => {
    const link = /kampus:\/\/shortcut\/([\w-]+)/.exec(kotlin)?.[1];
    expect(voice.SHORTCUTS.map((shortcut) => shortcut.wish)).toContain(link);
  });
});
