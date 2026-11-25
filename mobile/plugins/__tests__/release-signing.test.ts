// eslint-disable-next-line @typescript-eslint/no-require-imports
const { signReleaseWithUploadKey } = require("../with-release-signing") as {
  signReleaseWithUploadKey: (gradle: string) => string;
};

/*
 * The upload key in the generated Android project (A-268). The text below is
 * the part of Expo's template the plugin changes; the Play bundle workflow
 * proves the same on the real project.
 */
const TEMPLATE = `android {
    namespace "com.helloworld"
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe("the release build's signing key", () => {
  it("uses the upload key when the build is given one, the test key otherwise", () => {
    const out = signReleaseWithUploadKey(TEMPLATE);
    expect(out).toContain('def uploadStore = System.getenv("KAMPUS_UPLOAD_STORE_FILE")');
    expect(out).toContain('storePassword System.getenv("KAMPUS_UPLOAD_STORE_PASSWORD")');
    const release = out.slice(out.indexOf("        release {"));
    expect(release).toContain(
      'signingConfig System.getenv("KAMPUS_UPLOAD_STORE_FILE") ? signingConfigs.upload : signingConfigs.debug',
    );
    // The debug build keeps the test key, and no password is written into the file.
    const debug = out.slice(out.indexOf("    buildTypes {"), out.indexOf("        release {"));
    expect(debug).toContain("signingConfig signingConfigs.debug");
    expect(out.match(/storePassword '/g)).toHaveLength(1);
  });

  it("changes nothing the second time", () => {
    const once = signReleaseWithUploadKey(TEMPLATE);
    expect(signReleaseWithUploadKey(once)).toBe(once);
  });

  it("stops the build when the template's lines are gone, instead of shipping the test key", () => {
    expect(() => signReleaseWithUploadKey("android {\n}\n")).toThrow(/signingConfigs.debug/);
    expect(() =>
      signReleaseWithUploadKey(
        TEMPLATE.replace(
          "            signingConfig signingConfigs.debug\n            minify",
          "            minify",
        ),
      ),
    ).toThrow(/release build type/);
  });
});
