/*
 * Sharing the device's screen in a lesson (A-208). What the generated native
 * projects need for it, beyond what `react-native-webrtc` links by itself.
 *
 * Android: capturing the screen is allowed only while a foreground service of
 * the type "media projection" runs, with a notice the person can see. The
 * library has that service; here it is switched on, given an icon (the
 * library looks for a drawable named `ic_notification`) and worded in the
 * app's three languages.
 */
const fs = require("fs");
const path = require("path");

const { withDangerousMod, withMainApplication } = require("expo/config-plugins");

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

module.exports = function withScreenShare(config, { words }) {
  return withNoticeResources(withServiceSwitch(config), words);
};
module.exports.escapeXml = escapeXml;
