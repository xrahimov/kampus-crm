// The app shares the site's texts (../messages) and a few pure helpers
// (../src/lib: dates and money), so Metro also watches those two folders. Only
// files that import no package may be shared this way: a package asked for
// from up there is looked up in this folder's node_modules, never in the
// site's (another React must not end up in the app).
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.join(repoRoot, "messages"), path.join(repoRoot, "src", "lib")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.extraNodeModules = {
  "@kampus/messages": path.join(repoRoot, "messages"),
  "@kampus/lib": path.join(repoRoot, "src", "lib"),
};

module.exports = config;
