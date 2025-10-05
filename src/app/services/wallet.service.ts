import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';

import type { WalletInfo } from './cartera.service';
import { CarteraService } from './cartera.service';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private client: Wallet | null = null;
  private walletInfo: WalletInfo | null = null;
  private readonly chronik = new ChronikClient('https://chronik.e.cash/xec-mainnet');

  constructor(private readonly carteraService: CarteraService) {
    void this.ensureWalletInfo().catch(() => undefined);
  }

  get address(): string | null {
    return this.walletInfo?.address ?? null;
  }

  private async ensureClient(): Promise<Wallet> {
    const wallet = await this.ensureWalletInfo();

    if (!this.client) {
      const client = Wallet.fromSk(this.hexToBytes(wallet.privateKey), this.chronik);
      await client.sync();
      this.client = client;
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

  private hexToBytes(hex: string): Uint8Array {
    const normalized = hex.trim().replace(/^0x/i, '');
    if (!normalized || normalized.length % 2 !== 0) {
      throw new Error('La llave privada tiene un formato inválido.');
    }

    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < bytes.length; index++) {
      const byte = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
      if (Number.isNaN(byte)) {
        throw new Error('La llave privada tiene un formato inválido.');
      }
      bytes[index] = byte;
    }

    return bytes;
  }
}
