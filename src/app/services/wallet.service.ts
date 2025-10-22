import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import type { ChronikClient } from 'chronik-client';

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private chronik!: ChronikClient;
  private chronikInit: Promise<ChronikClient> | null = null;
  private wallet: Wallet | null = null;
  private static readonly SATS_PER_XEC = 100;

  constructor() {
    this.chronikInit = this.initChronik();
  }

  async loadFromMnemonic(mnemonic: string): Promise<Wallet> {
    const chronik = await this.getChronik();
    this.wallet = await Wallet.fromMnemonic(mnemonic, chronik as any);
    return this.wallet;
  }

  async getAddress(): Promise<string> {
    return this.getInitializedWallet().address;
  }

  async getBalance(): Promise<number> {
    const wallet = this.getInitializedWallet();
    const address = wallet.address;
    const chronik = await this.getChronik();
    const resp = await chronik.address(address).utxos();
    const balanceSats = resp.utxos.reduce((sum: number, utxo: any) => {
      const n = typeof utxo.sats === 'bigint' ? Number(utxo.sats) : Number(utxo.sats);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    const balanceXec = balanceSats / WalletService.SATS_PER_XEC;

    return balanceXec;
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

  private async getChronik(): Promise<ChronikClient> {
    if (this.chronik) {
      return this.chronik;
    }

    if (!this.chronikInit) {
      this.chronikInit = this.initChronik();
    }

    this.chronik = await this.chronikInit;
    return this.chronik;
  }

  private async initChronik(): Promise<ChronikClient> {
    const { ChronikClient } = await import('chronik-client');
    this.chronik = new ChronikClient('https://chronik.e.cash/xec');
    return this.chronik;
  }
}
