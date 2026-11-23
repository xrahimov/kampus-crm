/*
 * Checks the generated iPhone project (after `npx expo prebuild --platform ios
 * --no-install`) for what sharing the screen needs (A-223): the broadcast
 * extension as a target of its own, built with the app and copied into it,
 * and the shared folder named on both sides. It runs on any computer; building
 * the project itself needs a Mac.
 */
import { existsSync, readFileSync } from "node:fs";

const failures = [];
const need = (ok, what) => {
  if (!ok) failures.push(what);
};
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

const project = read("ios/Kampus.xcodeproj/project.pbxproj");
need(project !== "", "ios/Kampus.xcodeproj/project.pbxproj exists");
need(
  /productType = "com\.apple\.product-type\.app-extension"/.test(project),
  "the project has an app extension target",
);
need(
  /SampleHandler\.swift" in Sources|SampleHandler\.swift in Sources \*\/,/.test(project),
  "the extension compiles SampleHandler.swift",
);
need(
  /PRODUCT_BUNDLE_IDENTIFIER = "?center\.kampus\.app\.broadcast"?;/.test(project),
  "the extension is named center.kampus.app.broadcast",
);
need(
  /CODE_SIGN_ENTITLEMENTS = KampusBroadcast\/KampusBroadcast\.entitlements;/.test(project),
  "the extension has its entitlements",
);
need(
  /KampusBroadcast\.appex in Copy Files/.test(project),
  "the app copies the extension into itself",
);

// The copy comes before the app's script steps, or Xcode reports a cycle.
const app =
  /\/\* Kampus \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildPhases = \(([\s\S]*?)\);/.exec(
    project,
  );
const steps = app ? app[1] : "";
const copy = steps.indexOf("Copy Files");
const bundle = steps.indexOf("Bundle React Native code and images");
need(copy >= 0 && bundle >= 0 && copy < bundle, "the copy step comes before the script steps");
need(/PBXTargetDependency/.test(project), "the app depends on the extension");

const GROUP = "group.center.kampus.app";
const info = read("ios/Kampus/Info.plist");
need(
  new RegExp(`<key>RTCAppGroupIdentifier</key>\\s*<string>${GROUP}</string>`).test(info),
  "the app names the shared folder",
);
need(
  /<key>RTCScreenSharingExtension<\/key>\s*<string>center\.kampus\.app\.broadcast<\/string>/.test(
    info,
  ),
  "the app names its extension",
);
need(read("ios/Kampus/Kampus.entitlements").includes(GROUP), "the app may use the shared folder");
need(
  read("ios/KampusBroadcast/KampusBroadcast.entitlements").includes(GROUP),
  "the extension may use the shared folder",
);
const extensionInfo = read("ios/KampusBroadcast/KampusBroadcast-Info.plist");
need(extensionInfo.includes(GROUP), "the extension knows the shared folder");
need(
  extensionInfo.includes("com.apple.broadcast-services-upload"),
  "the extension is a broadcast upload extension",
);
need(existsSync("ios/KampusBroadcast/SampleHandler.swift"), "the extension's code is in place");

if (failures.length > 0) {
  console.error("The iPhone project is missing:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("The iPhone project has the screen-share extension.");
