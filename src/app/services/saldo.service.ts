import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { ecashToP2PKHHash160Hex } from '../utils/chronik';

import { CHRONIK_URL } from './chronik.constants';

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronikClient: ChronikClient = new ChronikClient(CHRONIK_URL);

  async getBalance(address: string): Promise<number> {
    const hash160 = ecashToP2PKHHash160Hex(address);
    const chronikScript = this.chronikClient.script('p2pkh', hash160);
    const { utxos = [] } = await chronikScript.utxos();

    const totalSats = utxos.reduce((sum: number, u: any) => {
      const v = typeof u.sats === 'bigint' ? Number(u.sats) : (u.sats ?? 0);
      return sum + v;
    }, 0);

    return totalSats / 100; // 100 sats = 1 XEC
  }

  formatBalance(xec: number | null | undefined): string {
    if (typeof xec !== 'number' || isNaN(xec)) return '0.00';
    return xec.toFixed(2);
  }
}
