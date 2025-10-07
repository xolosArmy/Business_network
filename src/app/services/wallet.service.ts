import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private chronik: ChronikClient;
  private wallet: Wallet | null = null;

  constructor() {
    this.chronik = new ChronikClient('https://chronik.e.cash/xec-mainnet');
  }

  async loadFromMnemonic(mnemonic: string) {
    this.wallet = await Wallet.fromMnemonic(mnemonic, this.chronik);
    return this.wallet;
  }

  async getAddress(): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not initialized');
    return this.wallet.getAddress();
  }

  async getBalance(): Promise<number> {
    if (!this.wallet) throw new Error('Wallet not initialized');
    const utxos = await this.wallet.getUtxos();
    const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    return balance / 100; // convertir satoshis a XEC
  }

  async createAndBroadcastTx(toAddress: string, amount: number) {
    if (!this.wallet) throw new Error('Wallet not initialized');
    const tx = await this.wallet.createTx({ to: toAddress, amount });
    const txid = await this.wallet.broadcastTx(tx);
    return txid;
  }
}
