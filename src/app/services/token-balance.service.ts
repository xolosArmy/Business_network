import { Injectable } from '@angular/core';
import { ChronikClient, type ScriptUtxos } from 'chronik-client';

import { ecashToP2PKHHash160Hex } from '../utils/chronik';

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

type BaseScriptUtxo = ScriptUtxos['utxos'] extends (infer U)[] ? U : never;
type ScriptUtxoWithToken = BaseScriptUtxo & { readonly token?: TokenLike | null };

export interface RmzBalance {
  readonly decimals: number;
  readonly atoms: string;
  readonly human: number;
}

@Injectable({ providedIn: 'root' })
export class TokenBalanceService {
  private readonly chronikClients: readonly ChronikClient[] = UNIQUE_CHRONIK_URLS.map(
    (url) => new ChronikClient(url),
  );

  async getRmzBalance(address: string): Promise<RmzBalance> {
    if (!address) {
      return { decimals: 0, atoms: '0', human: 0 };
    }

    const hash160 = ecashToP2PKHHash160Hex(address);
    const { utxos, client } = await this.fetchScriptUtxos(hash160);

    const tokenUtxos = utxos.filter(
      (utxo): utxo is ScriptUtxoWithToken & {
        readonly token: TokenLike & { readonly amount: string | number | bigint };
      } => {
        const token = utxo.token;
        return (
          !!token &&
          token.tokenId === RMZ_TOKEN_ID &&
          token.amount !== undefined &&
          token.amount !== null
        );
      },
    );

    const decimals = await this.fetchTokenDecimals(client, RMZ_TOKEN_ID);

    const atomsSum = tokenUtxos.reduce((sum, utxo) => {
      const amount = utxo.token.amount as string | number | bigint;
      return sum + BigInt(amount);
    }, 0n);

    const human = Number(atomsSum) / 10 ** decimals;

    return {
      decimals,
      atoms: atomsSum.toString(),
      human,
    };
  }

  private async fetchScriptUtxos(
    scriptHash: string,
  ): Promise<{ readonly utxos: ScriptUtxoWithToken[]; readonly client: ChronikClient | null }> {
    let lastError: unknown;

    for (const client of this.chronikClients) {
      try {
        const script = await client.script('p2pkh', scriptHash);
        const scriptUtxos: ScriptUtxos = await script.utxos();
        const utxos = (scriptUtxos?.utxos ?? []) as ScriptUtxoWithToken[];
        return { utxos, client };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return { utxos: [], client: null };
  }

  private async fetchTokenDecimals(
    preferredClient: ChronikClient | null,
    tokenId: string,
  ): Promise<number> {
    const clients = preferredClient
      ? [
          preferredClient,
          ...this.chronikClients.filter((client) => client !== preferredClient),
        ]
      : this.chronikClients;

    let lastError: unknown;

    for (const client of clients) {
      try {
        const token = await client.token(tokenId);
        return token.token?.decimals ?? 0;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return 0;
  }
}
