import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient('https://chronik.be.cash/xec');

  async getBalance(address: string): Promise<number> {
    // Use the address endpoint and then .utxos()
    const resp = await this.chronik.address(address).utxos();
    const list = resp?.utxos ?? [];
    const totalSats = list.reduce((sum: number, u: any) => {
      const sats = typeof u.sats === 'bigint' ? Number(u.sats) : Number(u.sats ?? 0);
      return sum + (Number.isFinite(sats) ? sats : 0);
    }, 0);
    // XEC = sats / 100
    return totalSats / 100;
  }

  formatBalance(balance: number): string {
    return Number(balance ?? 0).toFixed(2);
  }
}
