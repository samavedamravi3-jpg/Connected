// The app lives inside the web project's folder, and ../node_modules has a different React.
// Keep Metro inside mobile/: watch only this folder and block the parent's node_modules, so the bundle
// never mixes in the web app's packages. (Nested node_modules inside mobile/ still resolve normally.)
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const parentModules = path.resolve(__dirname, '..', 'node_modules').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.watchFolders = [__dirname];
config.resolver.blockList = [new RegExp(`^${parentModules}[\\\\/].*`)];

module.exports = config;
