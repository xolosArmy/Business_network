import { decodeCashAddress } from 'ecashaddrjs';

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convierte dirección ecash:qq... a hash160 (hex) para Chronik 0.7.x (P2PKH) */
export function addressToHash160(address: string): string {
  const { hash, type } = decodeCashAddress(address);
  const t = String(type).toLowerCase();
  if (t !== 'p2pkh') {
    throw new Error(`Solo se soporta P2PKH en esta app. Tipo recibido: ${type}`);
  }
  return toHex(hash);
}
