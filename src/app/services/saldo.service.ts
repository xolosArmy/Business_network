import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { addressToHash160 } from '../utils/address';

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient('https://chronik.e.cash/xec-mainnet');

  async getBalance(address: string): Promise<number> {
    const h160 = addressToHash160(address);
    const resp = await this.chronik.script('p2pkh', h160).utxos();

    const totalSats = resp.utxos.reduce((sum: number, utxo: any) => {
      const n = typeof utxo.sats === 'bigint' ? Number(utxo.sats) : Number(utxo.sats);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    return totalSats / 100; // 100 sats = 1 XEC
  }

  formatBalance(xec: number | null | undefined): string {
    if (typeof xec !== 'number' || isNaN(xec)) return '0.00';
    return xec.toFixed(2);
  }
}
