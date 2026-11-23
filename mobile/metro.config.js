// The app shares the site's texts (../messages) and the code under ../src/lib
// that both run: dates and money, and the lesson room's engine with its rules
// (A-207). So Metro also watches those two folders. A shared file may import
// only what this folder has installed too (today: zod): a package asked for
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
