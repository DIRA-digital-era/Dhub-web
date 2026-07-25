const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    const webMapPath = path.resolve(__dirname, 'src/components/MapView.web.tsx');
    const newContext = {
      ...context,
      filePath: webMapPath,
    };
    return resolve(newContext, webMapPath, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;