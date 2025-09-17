import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'text-encoding-polyfill';
import { TextEncoder, TextDecoder } from 'text-encoding-polyfill';
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

import { install } from 'react-native-quick-crypto';
install();
if (!global.crypto) global.crypto = require('react-native-quick-crypto');

import { Buffer } from 'buffer';
import { decode as atob, encode as btoa } from 'base-64';
if (!global.Buffer) global.Buffer = Buffer;
if (!global.atob) global.atob = atob;
if (!global.btoa) global.btoa = btoa;

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
AppRegistry.registerComponent(appName, () => App);
