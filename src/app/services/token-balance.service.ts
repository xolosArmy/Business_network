import { Injectable } from '@angular/core';
import { ChronikClient, type ScriptUtxos } from 'chronik-client';

import { ecashToP2PKHHash160Hex } from '../utils/chronik';

import { CHRONIK_URL } from './chronik.constants';

const RMZ_ID = '9e0a9d4720782cf661beaea6c5513f1972e0f3b1541ba4c83f4c87ef65f843dc';

type ChronikUtxo = NonNullable<ScriptUtxos['utxos']>[number];

type TokenizedUtxo = ChronikUtxo & {
  readonly slpMeta: NonNullable<ChronikUtxo['slpMeta']>;
  readonly slpToken: NonNullable<ChronikUtxo['slpToken']>;
};

export interface RmzBalance {
  readonly decimals: number;
  readonly atoms: string;
  readonly human: number;
}

@Injectable({ providedIn: 'root' })
export class TokenBalanceService {
  private readonly chronikClient = new ChronikClient(CHRONIK_URL);

  async getRmzBalance(address: string): Promise<RmzBalance> {
    if (!address) {
      return { decimals: 0, atoms: '0', human: 0 };
    }

    const hash160 = ecashToP2PKHHash160Hex(address);
    const script = this.chronikClient.script('p2pkh', hash160);
    const info = await this.chronikClient.token(RMZ_ID);
    const decimals = info?.slpTxData?.genesisInfo?.decimals ?? 0;

    const scriptUtxos = (await script.utxos()) as unknown as ScriptUtxos; // Chronik devuelve { outputScript, utxos }
    const allUtxos = scriptUtxos.utxos ?? [];
    const tokenUtxos = allUtxos.filter(
      (utxo): utxo is TokenizedUtxo => {
        const tokenId = utxo.slpMeta?.tokenId?.toLowerCase();
        const amount = utxo.slpToken?.amount;
        return (
          tokenId === RMZ_ID &&
          amount !== undefined &&
          amount !== null
        );
      },
    );

    const atoms = tokenUtxos.reduce<bigint>(
      (sum, utxo) => sum + BigInt(utxo.slpToken.amount),
      0n,
    );

    const human = Number(atoms) / 10 ** decimals;

    return { decimals, atoms: atoms.toString(), human };
  }
}
