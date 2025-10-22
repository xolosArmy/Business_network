import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';
import { addressToHash160 } from '../utils/address';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private chronik = new ChronikClient('https://chronik.e.cash/xec-mainnet');
  public wallet!: Wallet;

  async initFromMnemonic(mnemonic: string): Promise<void> {
    this.wallet = await Wallet.fromMnemonic(mnemonic, this.chronik as any);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  async getBalance(): Promise<number> {
    const address = this.wallet.address;
    const h160 = addressToHash160(address);
    const resp = await this.chronik.script('p2pkh', h160).utxos();

    const sats = resp.utxos.reduce((sum: number, utxo: any) => {
      const n = typeof utxo.sats === 'bigint' ? Number(utxo.sats) : Number(utxo.sats);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    return sats / 100;
  }
}
