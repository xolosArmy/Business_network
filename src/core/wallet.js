// src/core/wallet.js
// Cartera XEC para React Native (sin WASM)
// - BIP39 ES, BIP32 (@scure/*)
// - secp256k1/Hash160 (@noble/*)
// - Dirección eCash (CashAddr) con util local
// - Balance vía Chronik (BigInt-safe)

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as wordlistES } from '@scure/bip39/wordlists/spanish';
import { HDKey } from '@scure/bip32';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { ChronikClient } from 'chronik-client';
import { encodeECashP2PKH } from './cashaddr';

// ---------- utils ----------
const hash160 = (bytes) => ripemd160(sha256(bytes));
export const DERIVE_PATH = "m/44'/899'/0'/0/0"; // XEC BIP44
const CHRONIK_URL = 'https://chronik.e.cash'; // <- sin slash final

// Convierte a BigInt de forma segura
function toBigInt(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'string') return BigInt(v); // admite "12345" o "0x…"
  return 0n;
}

// Suma de satoshis robusta (u.satoshis | u.value | u.sats)
function sumUtxosSatsBig(utxos) {
  return utxos.reduce(
    (sum, u) => sum + toBigInt(u?.satoshis ?? u?.value ?? u?.sats ?? 0),
    0n
  );
}

function buildWalletFromHdNode(hd, mnemonic) {
  const child = hd.derive(DERIVE_PATH);
  if (!child?.privateKey) throw new Error('HD derivation failed');

  // PubKey comprimida (33 bytes)
  const pubkey = secp.getPublicKey(child.privateKey, true);
  const h160 = hash160(pubkey);
  const address = encodeECashP2PKH(h160);

  return {
    mnemonic,
    privKeyHex: Buffer.from(child.privateKey).toString('hex'),
    pubKeyHex: Buffer.from(pubkey).toString('hex'),
    address,
  };
}

// ---------- API ----------
export async function createWallet() {
  const mnemonic = generateMnemonic(wordlistES);
  if (!validateMnemonic(mnemonic, wordlistES)) throw new Error('mnemonic inválida');

  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  return buildWalletFromHdNode(hd, mnemonic);
}

export async function walletFromMnemonic(mnemonic) {
  if (!validateMnemonic(mnemonic, wordlistES)) throw new Error('mnemonic inválida');

  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  return buildWalletFromHdNode(hd, mnemonic);
}

/**
 * Devuelve balance en **XEC** (no sats). Acepta `wallet` o `address` string.
 */
export async function getBalance(addressOrWallet) {
  const address =
    typeof addressOrWallet === 'string'
      ? addressOrWallet
      : addressOrWallet?.address;

  if (!address) return 0;

  // 1) Cliente oficial (puede traer BigInt en los campos)
  try {
    const chronik = new ChronikClient(CHRONIK_URL);
    const res = await chronik.address(address).utxos(); // { utxos: [...] }
    const satsBig = sumUtxosSatsBig(res?.utxos ?? []);
    // XEC = sats / 100 (usa BigInt para evitar conversiones implícitas)
    const xec = Number(satsBig) / 100; // para UI está bien como Number
    return xec;
  } catch (e) {
    console.log('getBalance chronik-client failed:', e);
  }

  // 2) Fallback REST (si el cliente fallara o no estuviera disponible)
  try {
    const r = await fetch(
      `${CHRONIK_URL}/v2/address/${encodeURIComponent(address)}/utxos`
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = Array.isArray(data) ? data : data?.utxos ?? [];
    const satsBig = sumUtxosSatsBig(list);
    return Number(satsBig) / 100;
  } catch (e2) {
    console.log('getBalance fallback error', e2);
    return 0;
  }
}

// Placeholder: construcción/firmado/broadcast de TX
export async function signTx(_wallet, _toAddress, _amountXec) {
  // TODO:
  // - Selección UTXO (Chronik)
  // - Construcción inputs/outputs
  // - Fee
  // - Firma (secp256k1) + serialize
  // - Broadcast (chronik.tx.broadcastRaw)
  throw new Error('signTx: por implementar');
}
