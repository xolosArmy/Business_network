// src/core/cashaddr.js
// CashAddr encoder para eCash (prefijo "ecash"), P2PKH (hash160)

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [
  0x98f2bc8e61n,
  0x79b76d99e2n,
  0xf33e5fb3c4n,
  0xae2eabe2a8n,
  0x1e4f43e470n,
];

// fromBits -> toBits conversion (bech32-style)
function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << toBits) - 1;
  const ret = [];
  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }
  return ret;
}

function prefixToWords(prefix) {
  const out = [];
  for (const ch of prefix.toLowerCase()) out.push(ch.charCodeAt(0) & 31);
  return out;
}

function polymod(values) {
  let chk = 1n;
  for (const v of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(v);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & 1n) chk ^= GEN[i];
    }
  }
  return chk;
}

function createChecksum(prefix, payload) {
  const prefixData = prefixToWords(prefix);
  const values = [...prefixData, 0, ...payload, 0, 0, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1n;
  const chk = [];
  for (let p = 0; p < 8; p++) {
    chk.push(Number((mod >> BigInt(5 * (7 - p))) & 31n));
  }
  return chk;
}

/**
 * Codifica hash160 (20 bytes) a dirección CashAddr eCash P2PKH.
 * @param {Uint8Array} hash160 - 20 bytes (RIPEMD160(SHA256(pubkey)))
 * @returns {string} 'ecash:qq...'
 */
export function encodeECashP2PKH(hash160) {
  if (!(hash160 instanceof Uint8Array) || hash160.length !== 20) {
    throw new Error('encodeECashP2PKH: hash160 debe ser Uint8Array de 20 bytes');
  }
  const prefix = 'ecash';
  const TYPE_P2PKH = 0;   // 0 = P2PKH
  const SIZE_160BIT = 0;  // 0 = 160 bits

  const versionByte = (TYPE_P2PKH << 3) | SIZE_160BIT;

  // ⚠️ CORRECTO: convertir a 5 bits el bloque [versionByte || hash160]
  const data8 = [versionByte, ...hash160];
  const payload = convertBits(data8, 8, 5, true); // => array de 5 bits
  if (!payload) throw new Error('convertBits falló');

  const checksum = createChecksum(prefix, payload);
  const words = [...payload, ...checksum];
  const address = words.map(v => CHARSET[v]).join('');

  return `${prefix}:${address}`;
}
