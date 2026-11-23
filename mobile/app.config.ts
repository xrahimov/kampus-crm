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
  mobile: { permissions: { camera: string; microphone: string } };
}
function iosWording(locale: keyof typeof PERMISSIONS): Record<string, string> {
  return {
    NSCameraUsageDescription: PERMISSIONS[locale].camera,
    NSMicrophoneUsageDescription: PERMISSIONS[locale].microphone,
  };
}

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
      // The lesson room (A-207). The sentences are the English ones; `locales`
      // below gives iOS the Uzbek and Russian wording.
      NSCameraUsageDescription: PERMISSIONS.en.camera,
      NSMicrophoneUsageDescription: PERMISSIONS.en.microphone,
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
