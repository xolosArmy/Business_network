import { decodeCashAddress } from 'ecashaddrjs';
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

export function hashToHex(hash: string | Uint8Array): string {
  if (typeof hash === 'string') return hash;
  return toHex(hash);
}

/** Convierte dirección ecash:qq... a hash160 (hex) para Chronik 0.7.x (P2PKH) */
export function addressToHash160(address: string): string {
  const { hash, type } = decodeCashAddress(address);
  const t = String(type).toLowerCase();
  if (t !== 'p2pkh') {
    throw new Error(`Solo se soporta P2PKH en esta app. Tipo recibido: ${type}`);
  }
  return hashToHex(hash);
}
