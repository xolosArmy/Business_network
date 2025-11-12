import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChronikClient } from 'chronik-client';

import { CHRONIK_URL, RMZ_TOKEN_ID } from './chronik.constants';
import { ecashToP2PKHHash160Hex } from '../utils/chronik';

export interface BalanceSnapshot {
  xecBalance: number;
  rmzBalance: bigint;
}

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronikClient = new ChronikClient(CHRONIK_URL);
  private readonly balanceSubject = new BehaviorSubject<BalanceSnapshot>({
    xecBalance: 0,
    rmzBalance: 0n,
  });

  readonly balance$ = this.balanceSubject.asObservable();

  async actualizarSaldo(address: string): Promise<BalanceSnapshot> {
    const normalized = address?.trim();
    if (!normalized) {
      throw new Error('La dirección es obligatoria para consultar el saldo.');
    }

    const hash160 = ecashToP2PKHHash160Hex(normalized);
    const scriptUtxos = await this.chronikClient.script('p2pkh', hash160).utxos();
    const utxos = scriptUtxos.flatMap((entry) => entry.utxos ?? []);

    const totalSats = utxos.reduce<bigint>((sum, utxo) => {
      const value = typeof utxo?.value === 'string' ? BigInt(utxo.value) : BigInt(utxo?.value ?? 0);
      return sum + value;
    }, 0n);

    const rmzBalance = utxos.reduce<bigint>((sum, utxo) => {
      const tokenId = utxo?.slpMeta?.tokenId?.toLowerCase();
      if (tokenId !== RMZ_TOKEN_ID) {
        return sum;
      }
      const amountRaw = utxo?.slpToken?.amount ?? 0;
      return sum + BigInt(amountRaw);
    }, 0n);

    const xecBalance = Number(totalSats) / 100;
    const snapshot: BalanceSnapshot = { xecBalance, rmzBalance };
    this.balanceSubject.next(snapshot);
    return snapshot;
  }
}
