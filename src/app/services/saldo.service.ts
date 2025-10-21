import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient('https://chronik.be.cash/xec');

  async getBalance(address: string): Promise<number> {
    const resp = await this.chronik.address(address).utxos();
    const totalSats = resp.utxos.reduce((sum: number, utxo: any) => {
      const n = typeof utxo.sats === 'bigint' ? Number(utxo.sats) : Number(utxo.sats);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    return totalSats / 100;
  }

  formatBalance(balance: number): string {
    return Number(balance ?? 0).toFixed(2);
  }
}
