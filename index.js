// Polyfills necesarios para React Native (ejecución en móvil)
import { encode, decode } from 'base-64';
if (!global.btoa) global.btoa = encode;
if (!global.atob) global.atob = decode;

import 'react-native-url-polyfill/auto';
import 'text-encoding-polyfill';
import 'react-native-get-random-values';

import { install as installQuickCrypto } from 'react-native-quick-crypto';
installQuickCrypto();

import { Buffer } from 'buffer';
if (!global.Buffer) global.Buffer = Buffer;

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
