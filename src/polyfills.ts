import { encode, decode } from 'base-64';

if (!global.btoa) {
  global.btoa = encode;
}

if (!global.atob) {
  global.atob = decode;
}

import 'react-native-url-polyfill/auto';
import 'text-encoding-polyfill';
import 'react-native-get-random-values';

import { install as installQuickCrypto } from 'react-native-quick-crypto';

installQuickCrypto();

import { Buffer } from 'buffer';

if (!global.Buffer) {
  global.Buffer = Buffer;
}

if (typeof global.TextEncoder === 'undefined' &&
    typeof globalThis.TextEncoder !== 'undefined') {
  global.TextEncoder = globalThis.TextEncoder;
}

if (typeof global.TextDecoder === 'undefined' &&
    typeof globalThis.TextDecoder !== 'undefined') {
  global.TextDecoder = globalThis.TextDecoder;
}
