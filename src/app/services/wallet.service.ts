import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';

import type { WalletInfo } from './cartera.service';
import { CarteraService } from './cartera.service';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private client: Wallet | null = null;
  private walletInfo: WalletInfo | null = null;

  constructor(private readonly carteraService: CarteraService) {}

  private async ensureClient(): Promise<Wallet> {
    const wallet = await this.ensureWalletInfo();

    if (!this.client) {
      this.client = new Wallet(wallet.privateKey);
    }

    return this.client;
  }

  private async ensureWalletInfo(): Promise<WalletInfo> {
    if (!this.walletInfo) {
      const info = await this.carteraService.getWalletInfo();
      if (!info) {
        throw new Error('No se encontró una cartera configurada.');
      }
      if (!info.privateKey) {
        throw new Error('La cartera no contiene una llave privada válida.');
      }
      this.walletInfo = info;
    }

    return this.walletInfo;
  }

  async enviar(toAddress: string, amount: number): Promise<{ txid: string }> {
    const client = await this.ensureClient();
    const tx = await client.send(toAddress, amount);

    const txid = typeof tx === 'string' ? tx : tx?.txid;
    if (!txid) {
      throw new Error('La transacción no devolvió un identificador.');
    }

    return { txid: String(txid) };
  }

  clearCache(): void {
    this.client = null;
    this.walletInfo = null;
  }
}
