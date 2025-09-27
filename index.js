// Polyfills BEFORE importing App
import {encode as _btoa, decode as _atob} from 'base-64';
if (!global.btoa) global.btoa = _btoa;
if (!global.atob) global.atob = _atob;

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'text-encoding-polyfill';

import {install as installQuickCrypto} from 'react-native-quick-crypto';
installQuickCrypto();

import {Buffer} from 'buffer';
if (!global.Buffer) global.Buffer = Buffer;

import './src/polyfills';

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
