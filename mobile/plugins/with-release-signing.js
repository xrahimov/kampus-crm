/*
 * The key a release build is signed with (A-268).
 *
 * Google Play accepts an upload only when it is signed with the app's own
 * "upload key", and every later upload must carry the same one. The generated
 * Android project signs releases with the template's test key, which is fine
 * for trying the app and refused by the store. Here the release build is told
 * to use the upload key when the build is given one:
 *
 *   KAMPUS_UPLOAD_STORE_FILE      path of the keystore file
 *   KAMPUS_UPLOAD_STORE_PASSWORD  its password (also the key's)
 *   KAMPUS_UPLOAD_KEY_ALIAS       the key's name in the file ("upload" when unset)
 *
 * Without them nothing changes: the build is signed with the test key as
 * before. The key and its password are kai's; they are never in this
 * repository (docs/PLAY-STORE.md).
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const UPLOAD_CONFIG = `        // Google Play's upload key, when the build is given one (plugins/with-release-signing.js).
        upload {
            def uploadStore = System.getenv("KAMPUS_UPLOAD_STORE_FILE")
            if (uploadStore) {
                storeFile file(uploadStore)
                storePassword System.getenv("KAMPUS_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("KAMPUS_UPLOAD_KEY_ALIAS") ?: "upload"
                keyPassword System.getenv("KAMPUS_UPLOAD_STORE_PASSWORD")
            }
        }
`;
const RELEASE_SIGNING =
  'signingConfig System.getenv("KAMPUS_UPLOAD_STORE_FILE") ? signingConfigs.upload : signingConfigs.debug';

/**
 * `android/app/build.gradle` with the upload key added. Throws when the
 * template no longer has the lines this looks for, so that a change in a new
 * Expo version stops the build instead of quietly shipping the test key.
 */
function signReleaseWithUploadKey(gradle) {
  if (gradle.includes("signingConfigs.upload")) return gradle;
  const debugConfig = /( {4}signingConfigs \{\n {8}debug \{\n[^}]*\n {8}\}\n)/;
  if (!debugConfig.test(gradle)) {
    throw new Error("with-release-signing: no signingConfigs.debug block in app/build.gradle");
  }
  const withConfig = gradle.replace(debugConfig, `$1${UPLOAD_CONFIG}`);
  const releaseSigning =
    /( {8}release \{\n(?:[^}]*\n)*? {12})signingConfig signingConfigs\.debug\n/;
  if (!releaseSigning.test(withConfig)) {
    throw new Error("with-release-signing: the release build type has no signingConfig line");
  }
  return withConfig.replace(releaseSigning, `$1${RELEASE_SIGNING}\n`);
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = signReleaseWithUploadKey(mod.modResults.contents);
    return mod;
  });
}

module.exports = withReleaseSigning;
module.exports.signReleaseWithUploadKey = signReleaseWithUploadKey;
