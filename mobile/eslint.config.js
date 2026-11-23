// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", ".expo/*"],
  },
  {
    // The site's message files and pure helpers, shared by path (see metro.config.js).
    // The site writes Array<{ … }> for arrays of objects; the app keeps its style.
    rules: { "@typescript-eslint/array-type": "off" },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
  },
]);
