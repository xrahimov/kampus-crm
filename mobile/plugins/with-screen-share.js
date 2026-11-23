/*
 * Sharing the device's screen in a lesson (A-208). What the generated native
 * projects need for it, beyond what `react-native-webrtc` links by itself.
 *
 * Android: capturing the screen is allowed only while a foreground service of
 * the type "media projection" runs, with a notice the person can see. The
 * library has that service; here it is switched on, given an icon (the
 * library looks for a drawable named `ic_notification`) and worded in the
 * app's three languages.
 *
 * iPhone and iPad (A-223): iOS captures the screen in an app extension, a
 * small second program that ships inside the app. Here its files are copied
 * into the generated project, a target is added that builds them and puts the
 * result into the app, and both are given the same app group: the shared
 * folder through which the extension hands its frames to the app.
 */
const fs = require("fs");
const path = require("path");

const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withMainApplication,
  withXcodeProject,
} = require("expo/config-plugins");

const IMPORT = "import com.oney.WebRTCModule.WebRTCModuleOptions";
const SWITCH = "WebRTCModuleOptions.getInstance().enableMediaProjectionService = true";

/** A screen with an arrow going up out of it: the room's own "share" sign, in one colour. */
const ICON = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#00000000"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="2"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M4,3h16a2,2 0,0 1,2 2v10a2,2 0,0 1,-2 2H4a2,2 0,0 1,-2 -2V5a2,2 0,0 1,2 -2zM12,17v4M8,21h8M9,10l3,-3 3,3M12,13V7" />
</vector>
`;

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function strings(words) {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="media_projection_notification_title">${escapeXml(words.title)}</string>
    <string name="media_projection_notification_text">${escapeXml(words.text)}</string>
    <string name="ongoing_notification_channel_name">${escapeXml(words.channel)}</string>
</resources>
`;
}

function withServiceSwitch(config) {
  return withMainApplication(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes(SWITCH)) {
      if (!/super\.onCreate\(\)/.test(source)) {
        throw new Error("with-screen-share: MainApplication has no super.onCreate() to follow");
      }
      source = source.replace(/^(package .*\n)/, `$1\n${IMPORT}\n`);
      source = source.replace(
        /(\n(\s*)super\.onCreate\(\)\n)/,
        `$1$2// Sharing the screen in a lesson needs the library's foreground service (A-208).\n$2${SWITCH}\n`,
      );
      mod.modResults.contents = source;
    }
    return mod;
  });
}

/**
 * @param words per language: the notice's title and text, and the name of its
 *   channel in the phone's settings. `en` is the default.
 */
function withNoticeResources(config, words) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const res = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res");
      fs.mkdirSync(path.join(res, "drawable"), { recursive: true });
      fs.writeFileSync(path.join(res, "drawable/ic_notification.xml"), ICON);
      for (const [locale, text] of Object.entries(words)) {
        const folder = locale === "en" ? "values" : `values-b+${locale}`;
        fs.mkdirSync(path.join(res, folder), { recursive: true });
        fs.writeFileSync(path.join(res, folder, "kampus_screen_share.xml"), strings(text));
      }
      return mod;
    },
  ]);
}

/** The extension's name in the project, and the folder its files lie in. */
const BROADCAST = "KampusBroadcast";
const BROADCAST_SOURCES = ["SampleHandler.swift"];
const BROADCAST_FILES = [
  ...BROADCAST_SOURCES,
  `${BROADCAST}-Info.plist`,
  `${BROADCAST}.entitlements`,
];
const GROUPS_KEY = "com.apple.security.application-groups";

/** The names iOS knows the two programs and their shared folder by. */
function broadcastNames(config) {
  const app = config.ios && config.ios.bundleIdentifier;
  if (!app) throw new Error("with-screen-share: ios.bundleIdentifier is not set");
  return { app, extension: `${app}.broadcast`, group: `group.${app}` };
}

/** The app names its shared folder and its extension, where the WebRTC library looks for them. */
function withBroadcastNames(config) {
  const names = broadcastNames(config);
  config = withInfoPlist(config, (mod) => {
    mod.modResults.RTCAppGroupIdentifier = names.group;
    mod.modResults.RTCScreenSharingExtension = names.extension;
    return mod;
  });
  return withEntitlementsPlist(config, (mod) => {
    const groups = new Set(mod.modResults[GROUPS_KEY] || []);
    groups.add(names.group);
    mod.modResults[GROUPS_KEY] = [...groups];
    return mod;
  });
}

function withBroadcastFiles(config) {
  const names = broadcastNames(config);
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const from = path.join(path.dirname(module.filename), "broadcast");
      const to = path.join(mod.modRequest.platformProjectRoot, BROADCAST);
      fs.mkdirSync(to, { recursive: true });
      for (const file of BROADCAST_FILES) {
        const text = fs.readFileSync(path.join(from, file), "utf8");
        fs.writeFileSync(path.join(to, file), text.replace(/__APP_GROUP__/g, names.group));
      }
      return mod;
    },
  ]);
}

/** A build setting of the app's own target, such as the oldest iOS it runs on. */
function appSetting(project, bundleId, name, fallback) {
  const all = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(all)) {
    const settings = all[key].buildSettings;
    if (!settings || settings[name] === undefined) continue;
    const id = String(settings.PRODUCT_BUNDLE_IDENTIFIER || "").replace(/"/g, "");
    if (id === bundleId) return settings[name];
  }
  return fallback;
}

/**
 * `addTarget` puts the step that copies the extension into the app at the end
 * of the app's build steps, after the scripts that bundle JavaScript and copy
 * the pods' resources. Xcode then reports a cycle between that copy and those
 * scripts. The copy moves up, to right after the app's own resources.
 */
function embedBeforeScripts(project) {
  const app = project.getFirstTarget().firstTarget;
  const phases = app.buildPhases;
  const copy = phases.findIndex((phase) => phase.comment === "Copy Files");
  if (copy < 0) throw new Error("with-screen-share: the app has no step that embeds the extension");
  const [embed] = phases.splice(copy, 1);
  const resources = phases.findIndex((phase) => phase.comment === "Resources");
  phases.splice(resources < 0 ? phases.length : resources + 1, 0, embed);
}

function withBroadcastTarget(config) {
  const names = broadcastNames(config);
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    if (project.pbxTargetByName(BROADCAST)) return mod;

    // The files, as a folder of the project.
    const group = project.addPbxGroup(BROADCAST_FILES, BROADCAST, BROADCAST);
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      const entry = groups[key];
      if (typeof entry === "object" && entry.name === undefined && entry.path === undefined) {
        project.addToPbxGroup(group.uuid, key);
      }
    }

    // `addTarget` expects these two sections to exist; a fresh project has neither.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    // The target: built with the app and copied into it.
    const target = project.addTarget(BROADCAST, "app_extension", BROADCAST, names.extension);
    project.addBuildPhase(BROADCAST_SOURCES, "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

    const oldestIos = appSetting(project, names.app, "IPHONEOS_DEPLOYMENT_TARGET", "16.4");
    const team = config.ios && config.ios.appleTeamId;
    const all = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(all)) {
      const settings = all[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== `"${BROADCAST}"`) continue;
      settings.IPHONEOS_DEPLOYMENT_TARGET = oldestIos;
      settings.TARGETED_DEVICE_FAMILY = '"1,2"';
      settings.SWIFT_VERSION = "5.0";
      settings.CODE_SIGN_STYLE = "Automatic";
      settings.CODE_SIGN_ENTITLEMENTS = `${BROADCAST}/${BROADCAST}.entitlements`;
      // The same version as the app: the App Store refuses an extension that differs.
      settings.MARKETING_VERSION = config.version || "1.0.0";
      settings.CURRENT_PROJECT_VERSION = (config.ios && config.ios.buildNumber) || "1";
      settings.GENERATE_INFOPLIST_FILE = "NO";
      settings.SKIP_INSTALL = "YES";
      settings.LD_RUNPATH_SEARCH_PATHS =
        '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
      if (team) settings.DEVELOPMENT_TEAM = team;
    }
    if (team) project.addTargetAttribute("DevelopmentTeam", team, target);
    embedBeforeScripts(project);
    return mod;
  });
}

function withBroadcast(config) {
  return withBroadcastTarget(withBroadcastFiles(withBroadcastNames(config)));
}

module.exports = function withScreenShare(config, { words }) {
  return withBroadcast(withNoticeResources(withServiceSwitch(config), words));
};
module.exports.escapeXml = escapeXml;
module.exports.broadcastNames = broadcastNames;
