import { Injectable } from '@angular/core';
import { ChronikClient } from 'ecash-wallet';

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient('https://chronik.be.cash/xec');

  async getSaldo(address: string): Promise<number> {
    const utxosResponse = await this.chronik.addressUtxos(address);
    const utxos = utxosResponse.utxos || [];
    const total = utxos.reduce((sum: number, utxo: any) => sum + utxo.sats, 0);
    return total / 100; // Convert sats to XEC
  }
}
