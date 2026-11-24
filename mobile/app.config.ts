import type { ConfigContext, ExpoConfig } from "expo/config";

import en from "../messages/en.json";
import ru from "../messages/ru.json";
import uz from "../messages/uz.json";

/*
 * The Kampus app for phones and tablets (A-203): one React Native project for
 * Android, iOS and the web. Native folders are generated from this file
 * (`npx expo prebuild`), never edited by hand.
 *
 * EXPO_PUBLIC_API_URL points a build at another server than the live one,
 * for example http://10.0.2.2:3000 (the computer, as the Android emulator
 * sees it).
 */
/** Counts up with every build, so a newer file installs over an older one. */
const BUILD = Number(process.env.APP_BUILD ?? "1");

/** Why the app asks for the camera and the microphone, in the app's three languages. */
const PERMISSIONS = {
  en: (en as Messages).mobile.permissions,
  ru: (ru as Messages).mobile.permissions,
  uz: (uz as Messages).mobile.permissions,
};
interface Messages {
  mobile: {
    permissions: { camera: string; microphone: string; photos: string };
    room: { shareNotice: string; shareNoticeText: string; shareChannel: string };
  };
}
/** The notice Android shows while the screen is shared (A-208). */
function shareWords(messages: unknown) {
  const room = (messages as Messages).mobile.room;
  return { title: room.shareNotice, text: room.shareNoticeText, channel: room.shareChannel };
}
/** Under `ios`, so the sentences reach the iPhone's question and stay out of Android's resources. */
function iosWording(locale: keyof typeof PERMISSIONS): { ios: Record<string, string> } {
  return {
    ios: {
      NSCameraUsageDescription: PERMISSIONS[locale].camera,
      NSMicrophoneUsageDescription: PERMISSIONS[locale].microphone,
      NSPhotoLibraryUsageDescription: PERMISSIONS[locale].photos,
    },
  };
}

/*
 * The release build is shrunk, and the shrinker stops at a class the WebRTC
 * library names but does not ship (an optional video decoder). The library
 * keeps everything it does ship by its own rules; the loudspeaker module is
 * reached from JavaScript by name, so it is kept whole too.
 */
const SHRINKER_RULES = [
  "-dontwarn org.webrtc.**",
  "-keep class com.zxcpoiu.incallmanager.** { *; }",
  // The lesson's own service and module (modules/kampus-call).
  "-keep class center.kampus.call.** { *; }",
  // The PDF page view (A-210) draws through native code that calls back by name.
  "-keep class io.legere.pdfiumandroid.** { *; }",
  "-keep class com.github.barteksc.pdfviewer.** { *; }",
].join("\n");

/**
 * A build pointed at a plain http server is a test build against a computer on
 * the desk (http://10.0.2.2:3000 from the Android emulator). Android refuses
 * plain http in a release build unless told otherwise; the builds that go to
 * people talk to https and keep the refusal.
 */
const PLAIN_HTTP = (process.env.EXPO_PUBLIC_API_URL ?? "").startsWith("http://");

const LAPIS = "#17234b";
const TURQUOISE = "#58d4d0";
const PORCELAIN = "#f7f9fc";
const NIGHT = "#0c111f";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Kampus",
  slug: "kampus",
  version: "1.0.0",
  scheme: "kampus",
  // Phones stand upright; tablets turn freely (teachers prop an iPad on its side).
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: PORCELAIN,
  ios: {
    bundleIdentifier: "center.kampus.app",
    buildNumber: String(BUILD),
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleLocalizations: ["uz", "ru", "en"],
      // The lesson room (A-207) and homework answers (A-212). The sentences are
      // the English ones; `locales` below gives iOS the Uzbek and Russian wording.
      NSCameraUsageDescription: PERMISSIONS.en.camera,
      NSMicrophoneUsageDescription: PERMISSIONS.en.microphone,
      // A photo of the notebook as a homework answer (A-212).
      NSPhotoLibraryUsageDescription: PERMISSIONS.en.photos,
      // A lesson keeps its sound when the teacher looks at another app for a moment.
      UIBackgroundModes: ["audio"],
    },
  },
  locales: {
    en: iosWording("en"),
    ru: iosWording("ru"),
    uz: iosWording("uz"),
  },
  android: {
    package: "center.kampus.app",
    versionCode: BUILD,
    adaptiveIcon: {
      backgroundColor: TURQUOISE,
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // The lesson room (A-207): camera, microphone, the loudspeaker and headsets.
    permissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.WAKE_LOCK",
      // Sharing the screen (A-208) runs as a service with a visible notice.
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
      "android.permission.POST_NOTIFICATIONS",
    ],
  },
  web: {
    output: "single",
    favicon: "./assets/favicon.png",
    name: "Kampus",
    shortName: "Kampus",
    themeColor: LAPIS,
    backgroundColor: PORCELAIN,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-localization",
    "expo-font",
    "expo-web-browser",
    [
      "expo-build-properties",
      { android: { extraProguardRules: SHRINKER_RULES, usesCleartextTraffic: PLAIN_HTTP } },
    ],
    // The camera that reads student badges (A-264). The sentences are the lesson room's own,
    // which name the badges too; `locales` above gives iOS the Uzbek and Russian wording.
    [
      "expo-camera",
      {
        cameraPermission: PERMISSIONS.en.camera,
        microphonePermission: PERMISSIONS.en.microphone,
      },
    ],
    [
      "./plugins/with-screen-share",
      { words: { en: shareWords(en), ru: shareWords(ru), uz: shareWords(uz) } },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: PORCELAIN,
        image: "./assets/splash-icon.png",
        imageWidth: 96,
        dark: { backgroundColor: NIGHT, image: "./assets/splash-icon.png" },
      },
    ],
  ],
  experiments: { typedRoutes: true },
});
