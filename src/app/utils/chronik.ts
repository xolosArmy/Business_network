import * as ecashaddr from 'ecashaddrjs';
import { Buffer } from 'buffer';

export function ecashToP2PKHHash160Hex(address: string): string {
  const decoded = ecashaddr.decode(address, true); // throwOnError
  if (!decoded || decoded.type !== 'p2pkh') {
    throw new Error('Solo se soportan direcciones ecash: P2PKH');
  }
  return Buffer.from(decoded.hash).toString('hex');
}
