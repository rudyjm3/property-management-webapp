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

// 4. Force react to resolve to a single instance for ALL imports — including
//    imports originating inside node_modules/react-native. extraNodeModules
//    only applies to app-level code; resolveRequest intercepts everything.
//    react-native's renderer is compiled against 19.1.0, so we pin to the
//    mobile workspace copy (apps/mobile/node_modules/react@19.1.0).
const mobilReactPath = path.resolve(projectRoot, 'node_modules/react');
const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react') {
    return { filePath: path.join(mobilReactPath, 'index.js'), type: 'sourceFile' };
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Block nativewind and its deps from being watched — they're incompatible with RN 0.76
config.resolver.blockList = [
  /node_modules\/nativewind\/.*/,
  /node_modules\/react-native-css-interop\/.*/,
];

module.exports = config;
