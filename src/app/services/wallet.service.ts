import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import { ChronikClient, type ScriptUtxos } from 'chronik-client';

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private chronik: ChronikClient;
  private wallet: Wallet | null = null;
  private static readonly SATS_PER_XEC = 100;

  constructor() {
    this.chronik = new ChronikClient('https://chronik.be.cash/xec');
  }

  async loadFromMnemonic(mnemonic: string): Promise<Wallet> {
    this.wallet = await Wallet.fromMnemonic(mnemonic, this.chronik);
    return this.wallet;
  }

  async getAddress(): Promise<string> {
    return this.getInitializedWallet().address;
  }

  async getBalance(): Promise<number> {
    const wallet = this.getInitializedWallet();
    const address = wallet.address;
    const resp: ScriptUtxos = await this.chronik.address(address).utxos();
    const list = resp?.utxos ?? [];
    const totalSats = list.reduce((sum: number, u: any) => {
      const sats = typeof u.sats === 'bigint' ? Number(u.sats) : Number(u.sats ?? 0);
      return sum + (Number.isFinite(sats) ? sats : 0);
    }, 0);

    return totalSats / WalletService.SATS_PER_XEC;
  }

  async createAndBroadcastTx(toAddress: string, amount: number): Promise<string> {
    const { txid } = await this.broadcastTransaction(toAddress, amount);
    return txid;
  }

  async enviar(toAddress: string, amount: number): Promise<{
    txid: string;
    rawTx: string;
    result: unknown;
  }> {
    return this.broadcastTransaction(toAddress, amount);
  }

  async signTx(toAddress: string, amount: number): Promise<string> {
    const wallet = this.getInitializedWallet();
    return wallet.createTx({ to: toAddress, amount });
  }

  private async broadcastTransaction(toAddress: string, amount: number): Promise<{
    txid: string;
    rawTx: string;
    result: unknown;
  }> {
    const wallet = this.getInitializedWallet();
    const rawTx = await wallet.createTx({ to: toAddress, amount });
    const broadcastResult = await wallet.broadcastTx(rawTx);
    const txid = this.extractTxId(broadcastResult);

    if (!txid) {
      throw new Error('Unable to determine transaction ID from broadcast result');
    }

    return { txid, rawTx, result: broadcastResult };
  }

  private getInitializedWallet(): Wallet {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    return this.wallet;
  }

  private extractTxId(result: unknown): string | null {
    if (typeof result === 'string' && result) {
      return result;
    }

    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      const possibleKeys = ['txid', 'txId', 'id'];
      for (const key of possibleKeys) {
        const value = record[key];
        if (typeof value === 'string' && value) {
          return value;
        }
      }
    }

    return null;
  }
}
