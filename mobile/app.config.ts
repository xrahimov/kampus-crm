import type { ConfigContext, ExpoConfig } from "expo/config";

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
    },
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
