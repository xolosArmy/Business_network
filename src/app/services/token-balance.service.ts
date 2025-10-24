import { Injectable } from '@angular/core';
import { ChronikClient, type ScriptUtxo } from 'chronik-client';

import { addressToHash160 } from '../utils/address';

import {
  CHRONIK_FALLBACK_URLS,
  CHRONIK_URL,
  RMZ_TOKEN_ID,
} from './chronik.constants';

const UNIQUE_CHRONIK_URLS = Array.from(
  new Set<string>([CHRONIK_URL, ...CHRONIK_FALLBACK_URLS]),
);

interface TokenLike {
  readonly tokenId: string;
  readonly amount?: string | number | bigint;
  readonly commitment?: string;
  readonly capability?: string;
}

type ScriptUtxoWithToken = ScriptUtxo & { readonly token?: TokenLike | null };

@Injectable({ providedIn: 'root' })
export class TokenBalanceService {
  private readonly chronikClients: readonly ChronikClient[] = UNIQUE_CHRONIK_URLS.map(
    (url) => new ChronikClient(url),
  );

  async getRMZBalance(address: string): Promise<bigint> {
    if (!address) {
      return 0n;
    }

    const scriptHash = addressToHash160(address);
    const utxos = await this.fetchScriptUtxos(scriptHash);
    return utxos.reduce((total, utxo) => total + this.extractRmzAmount(utxo), 0n);
  }

  private async fetchScriptUtxos(scriptHash: string): Promise<ScriptUtxoWithToken[]> {
    let lastError: unknown;

    for (const client of this.chronikClients) {
      try {
        const script = await client.script('p2pkh', scriptHash);
        const utxos = (script?.utxos ?? []) as ScriptUtxoWithToken[];
        return utxos;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return [];
  }

  private extractRmzAmount(utxo: ScriptUtxoWithToken): bigint {
    const token = utxo.token;
    if (!token || token.tokenId !== RMZ_TOKEN_ID) {
      return 0n;
    }

    const { amount } = token;
    if (amount === undefined || amount === null) {
      return 0n;
    }

    if (typeof amount === 'bigint') {
      return amount;
    }

    if (typeof amount === 'number') {
      if (!Number.isFinite(amount)) {
        return 0n;
      }

      return BigInt(Math.trunc(amount));
    }

    if (typeof amount === 'string') {
      try {
        return BigInt(amount);
      } catch (error) {
        console.warn('No se pudo convertir el monto del token a BigInt', error);
        return 0n;
      }
    }

    return 0n;
  }
}
