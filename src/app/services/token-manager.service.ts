import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import AdapterRouter from 'minimal-xec-wallet/lib/adapters/router';
import HybridTokenManager, {
  type HybridTokenBalance,
} from 'minimal-xec-wallet/lib/hybrid-token-manager';

import { CHRONIK_FALLBACK_URLS, CHRONIK_URL } from './chronik.constants';

export type TokenBalance = HybridTokenBalance;

@Injectable({ providedIn: 'root' })
export class TokenManagerService {
  private readonly chronikClient = new ChronikClient(CHRONIK_URL);
  private readonly adapterRouter = new AdapterRouter({
    chronik: this.chronikClient,
    chronikUrls: [...CHRONIK_FALLBACK_URLS],
  });
  private readonly hybridTokenManager = new HybridTokenManager({
    chronik: this.chronikClient,
    ar: this.adapterRouter,
    chronikUrls: [...CHRONIK_FALLBACK_URLS],
  });

  get chronik(): ChronikClient {
    return this.chronikClient;
  }

  get manager(): HybridTokenManager {
    return this.hybridTokenManager;
  }

  async getTokenBalance(tokenId: string, address: string): Promise<TokenBalance> {
    const utxoData = await this.adapterRouter.getUtxos(address);
    const utxos = this.normalizeUtxos(utxoData);
    return this.hybridTokenManager.getTokenBalance(tokenId, utxos);
  }

  async listTokens(address: string): Promise<TokenBalance[]> {
    const utxoData = await this.adapterRouter.getUtxos(address);
    const utxos = this.normalizeUtxos(utxoData);
    return this.hybridTokenManager.listTokensFromUtxos(utxos);
  }

  private normalizeUtxos(utxoData: unknown): any[] {
    if (Array.isArray(utxoData)) {
      if (utxoData.length === 0) {
        return [];
      }

      if (this.looksLikeUtxo(utxoData[0])) {
        return utxoData as any[];
      }

      return utxoData.flatMap((entry) => this.normalizeUtxos(entry));
    }

    if (utxoData && typeof utxoData === 'object') {
      const maybeObject = utxoData as { utxos?: unknown };
      if (maybeObject.utxos !== undefined) {
        return this.normalizeUtxos(maybeObject.utxos);
      }
    }

    return [];
  }

  private looksLikeUtxo(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }

    const record = candidate as Record<string, unknown>;
    return (
      typeof record.outpoint === 'object' &&
      record.outpoint !== null &&
      typeof (record.outpoint as Record<string, unknown>).txid === 'string'
    );
  }
}
