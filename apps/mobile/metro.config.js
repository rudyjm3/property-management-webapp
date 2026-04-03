const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve packages from the monorepo root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Point @propflow/shared directly to its src/ directory so Metro can
//    process the TypeScript source files rather than looking for a dist/
config.resolver.extraNodeModules = {
  '@propflow/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
};

// Block nativewind and its deps from being watched — they're incompatible with RN 0.76
config.resolver.blockList = [
  /node_modules\/nativewind\/.*/,
  /node_modules\/react-native-css-interop\/.*/,
];

module.exports = config;
