// metro.config.js
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  {
    resolver: {
      // add extraResolver if needed later (e.g., wasm)
    },
  },
);
