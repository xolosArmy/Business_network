import * as ecashaddr from 'ecashaddrjs';
import { Buffer } from 'buffer';

export function ecashToP2PKHHash160Hex(address: string): string {
  return toChronikScript(address).payload;
}

export function toChronikScript(address: string): {
  type: 'p2pkh' | 'p2sh' | 'p2pk';
  payload: string;
} {
  const normalized = address?.trim();
  if (!normalized) {
    throw new Error('La dirección debe ser una cadena no vacía.');
  }

  let decoded: { type?: string; hash: Uint8Array } | undefined;

  if (typeof (ecashaddr as any).decode === 'function') {
    decoded = (ecashaddr as any).decode(normalized, true);
  } else if (typeof ecashaddr.decodeCashAddress === 'function') {
    decoded = ecashaddr.decodeCashAddress(normalized) as unknown as {
      type?: string;
      hash: Uint8Array;
    };
  }

  if (!decoded || !decoded.hash) {
    throw new Error('No se pudo decodificar la dirección proporcionada.');
  }

  const type = String(decoded.type || '').toUpperCase();
  if (type !== 'P2PKH') {
    throw new Error(`Solo P2PKH soportado por ahora (recibido: ${decoded.type})`);
  }

  const payload = Buffer.from(decoded.hash).toString('hex');

  return {
    type: 'p2pkh',
    payload,
  };
}
