const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// 1. Tell Metro to ignore .wasm files
config.resolver.assetExts.push('wasm');

// 2. Create a mock file for expo-sqlite on web
const mockExpoSQLite = path.resolve(__dirname, 'src/mocks/expo-sqlite.ts');
const mockDir = path.resolve(__dirname, 'src/mocks');
if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });
if (!fs.existsSync(mockExpoSQLite)) {
  fs.writeFileSync(mockExpoSQLite, `
export const openDatabase = () => ({
  execute: () => Promise.resolve(),
  close: () => {},
});
export default { openDatabase };
`);
}

// 3. Redirect expo-sqlite to the mock on web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-sqlite') {
    const newContext = { ...context, filePath: mockExpoSQLite };
    return resolve(newContext, mockExpoSQLite, platform);
  }

  if (platform === 'web' && moduleName === 'react-native-maps') {
    const webMapPath = path.resolve(__dirname, 'src/components/MapView.web.tsx');
    const newContext = { ...context, filePath: webMapPath };
    return resolve(newContext, webMapPath, platform);
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;