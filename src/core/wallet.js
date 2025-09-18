// src/core/wallet.js
// RMZ Wallet core - React Native (sin WASM)
// - BIP39 ES + BIP32 (@scure/*)
// - secp256k1 + Hash160 (@noble/*)
// - CashAddr eCash P2PKH (encode/decode sin dependencias)
// - Balance vía Chronik (cliente oficial + REST fallback, con diagnóstico)

import { Alert } from 'react-native';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as WORDS_ES } from '@scure/bip39/wordlists/spanish';
import { HDKey } from '@scure/bip32';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { ChronikClient } from 'chronik-client';

// ------- Config -------
export const DERIVE_PATH = "m/44'/899'/0'/0/0"; // XEC BIP44
export const CHRONIK_MIRROR = 'https://chronik.e.cash'; // mirror estable
const SHOW_ALERTS = true; // ponlo en false si no quieres Alert al consultar saldo

// ------- Utils hex/bin -------
const toHex = (buf) => Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
const concat = (...arrs) => {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const u16LE = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
const u32LE = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const i64LE = (n) => { // number seguro (<= 2^53-1)
  const lo = n >>> 0, hi = Math.floor(n / 2 ** 32) >>> 0;
  const b = new Uint8Array(8); const dv = new DataView(b.buffer);
  dv.setUint32(0, lo, true); dv.setUint32(4, hi, true); return b;
};
const varint = (n) => {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return concat(new Uint8Array([0xfd]), u16LE(n));
  if (n <= 0xffffffff) return concat(new Uint8Array([0xfe]), u32LE(n));
  return concat(new Uint8Array([0xff]), i64LE(n));
};
const pushData = (bytes) => {
  const len = bytes.length;
  if (len < 0x4c) return concat(new Uint8Array([len]), bytes);
  if (len <= 0xff) return concat(new Uint8Array([0x4c, len]), bytes);       // OP_PUSHDATA1
  if (len <= 0xffff) return concat(new Uint8Array([0x4d, ...u16LE(len)]), bytes); // OP_PUSHDATA2
  return concat(new Uint8Array([0x4e, ...u32LE(len)]), bytes);              // OP_PUSHDATA4
};
const sha256d = (b) => sha256(sha256(b));
const hash160 = (bytes) => ripemd160(sha256(bytes));

const OP = { DUP: 0x76, HASH160: 0xa9, EQUALVERIFY: 0x88, CHECKSIG: 0xac };

// ------- CashAddr eCash (P2PKH) -------
const CHARSET = 'qpzry9x8gf2tvdw0s3n5j4khce6mua7l';
const CHARMAP = Object.fromEntries([...CHARSET].map((c, i) => [c, i]));
const prefixExpand = (p) => [...p].map(c => c.charCodeAt(0) & 31).concat(0);
const convertBits = (data, from, to, pad = true) => {
  let acc = 0, bits = 0; const maxv = (1 << to) - 1; const out = [];
  for (const v of data) {
    if (v < 0 || v >> from) return null;
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return out;
};
function polymod(values) {
  const GEN = [0x98f2bc8e61, 0x79b76d99e2, 0xf33e5fb3c4, 0xae2eabe2a8, 0x1e4f43e470];
  let chk = 1n;
  for (const v of values) {
    const b = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(v);
    GEN.forEach((g, i) => { if ((b >> BigInt(i)) & 1n) chk ^= BigInt(g); });
  }
  return chk ^ 1n;
}
export function encodeECashP2PKH(hash20) {
  const prefix = 'ecash';
  if (!(hash20 instanceof Uint8Array) || hash20.length !== 20)
    throw new Error('encodeECashP2PKH: hash debe ser 20 bytes');
  const TYPE_P2PKH = 0, SIZE_160 = 0;
  const version = (TYPE_P2PKH << 3) | SIZE_160;
  const payload8 = new Uint8Array([version, ...hash20]);
  const payload5 = convertBits(payload8, 8, 5, true);
  const chkIn = [...prefixExpand(prefix), ...payload5, 0,0,0,0,0,0,0,0];
  const mod = polymod(chkIn);
  const checksum = Array(8).fill(0).map((_, i) => Number((mod >> BigInt(5*(7-i))) & 31n));
  const addr = [...payload5, ...checksum].map(v => CHARSET[v]).join('');
  return `${prefix}:${addr}`;
}
export function decodeECashP2PKH(addr) {
  const [prefix, data] = String(addr).toLowerCase().split(':');
  if (prefix !== 'ecash' || !data) throw new Error('CashAddr inválido (prefijo)');
  const values = [...data].map(c => {
    if (!(c in CHARMAP)) throw new Error('CashAddr inválido (charset)');
    return CHARMAP[c];
  });
  if (values.length < 8) throw new Error('CashAddr inválido (largo)');
  const payload = values.slice(0, -8);
  const mod = polymod([...prefixExpand(prefix), ...payload, 0,0,0,0,0,0,0,0]);
  if (mod !== 1n) throw new Error('CashAddr checksum inválido');
  const payload8 = convertBits(payload, 5, 8, false);
  const version = payload8[0];
  const type = version >> 3;
  const sizeCode = version & 7;
  const sizes = [20,24,28,32,40,48,56,64];
  const expect = sizes[sizeCode];
  const hash = payload8.slice(1);
  if (type !== 0 || hash.length !== expect) throw new Error('CashAddr versión/tamaño no soportado');
  return { type: 'P2PKH', hash160: new Uint8Array(hash.slice(0, 20)) };
}
const scriptPubKeyP2PKH = (hash20) =>
  concat(new Uint8Array([OP.DUP, OP.HASH160]), pushData(hash20),
         new Uint8Array([OP.EQUALVERIFY, OP.CHECKSIG]));

// ------- Wallet build -------
function buildWalletFromHdNode(hd, mnemonic) {
  const child = hd.derive(DERIVE_PATH);
  if (!child?.privateKey) throw new Error('Derivación HD falló');
  const pubkey = secp.getPublicKey(child.privateKey, true); // 33 bytes
  const h160 = hash160(pubkey);
  const address = encodeECashP2PKH(h160);
  return {
    mnemonic,
    privKeyHex: toHex(child.privateKey),
    pubKeyHex: toHex(pubkey),
    address,
  };
}

export function createWallet() {
  const mnemonic = generateMnemonic(WORDS_ES);
  if (!validateMnemonic(mnemonic, WORDS_ES)) throw new Error('mnemonic inválida');
  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  return buildWalletFromHdNode(hd, mnemonic);
}

export function walletFromMnemonic(mnemonic) {
  if (!validateMnemonic(mnemonic, WORDS_ES)) throw new Error('mnemonic inválida');
  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  return buildWalletFromHdNode(hd, mnemonic);
}

// ------- Balance (Diagnóstico completo) -------
const sumUtxosSats = (utxos = []) => {
  let total = 0n;
  for (const u of utxos) {
    const v = u?.satoshis ?? u?.value ?? u?.sats ?? 0;
    total += typeof v === 'bigint' ? v : BigInt(String(v));
  }
  return total;
};

async function tryClient(address) {
  for (const base of [`${CHRONIK_MIRROR}/xec-mainnet`, CHRONIK_MIRROR]) {
    try {
      console.log('[balance] client ->', base);
      const cli = new ChronikClient(base);
      const { utxos } = await cli.address(address).utxos();
      const sats = sumUtxosSats(utxos);
      console.log('[balance] client OK', { base, utxos: utxos?.length ?? 0, sats: String(sats) });
      return sats;
    } catch (e) {
      console.log('[balance] client FAIL', base, e?.message || e);
    }
  }
  throw new Error('client-failed');
}

async function tryRest(address) {
  const addr = encodeURIComponent(address);
  const routes = [
    `${CHRONIK_MIRROR}/address/${addr}/utxos`,
    `${CHRONIK_MIRROR}/xec-mainnet/address/${addr}/utxos`,
  ];
  for (const url of routes) {
    try {
      console.log('[balance] REST ->', url);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list = Array.isArray(data) ? data : (data?.utxos ?? []);
      const sats = sumUtxosSats(list);
      console.log('[balance] REST OK', { url, utxos: list?.length ?? 0, sats: String(sats) });
      return sats;
    } catch (e) {
      console.log('[balance] REST FAIL', url, e?.message || e);
    }
  }
  throw new Error('rest-failed');
}

/** Devuelve balance en **XEC** (sats/100). Acepta `wallet` o `address` string. */
export async function getBalance(addressOrWallet) {
  const address = typeof addressOrWallet === 'string'
    ? addressOrWallet
    : addressOrWallet?.address;

  if (!address) { console.log('[balance] no address'); return 0; }

  console.log('[balance] start for', address);

  try {
    const sats = await tryClient(address);
    const xec = Number(sats) / 100;
    if (SHOW_ALERTS) Alert.alert('Balance (client)', `${xec.toFixed(2)} XEC`);
    return xec;
  } catch (e) {
    console.log('[balance] client exhausted:', e?.message || e);
  }

  try {
    const sats = await tryRest(address);
    const xec = Number(sats) / 100;
    if (SHOW_ALERTS) Alert.alert('Balance (REST)', `${xec.toFixed(2)} XEC`);
    return xec;
  } catch (e) {
    console.log('[balance] rest exhausted:', e?.message || e);
  }

  if (SHOW_ALERTS) Alert.alert('Balance', 'No se pudo obtener UTXOs');
  return 0;
}

// ------- (Opcional) helpers de TX P2PKH -------
// Aquí quedan disponibles los helpers si luego implementamos sign/broadcast:
export const scriptPubKeyFromAddress = (addr) => scriptPubKeyP2PKH(decodeECashP2PKH(addr).hash160);
