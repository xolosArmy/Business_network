import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';

import type { WalletInfo } from './cartera.service';
import { CarteraService } from './cartera.service';

const SATS_PER_XEC = 100;

@Injectable({ providedIn: 'root' })
export class WalletService {
  private client: Wallet | null = null;
  private walletInfo: WalletInfo | null = null;
  private readonly chronik = new ChronikClient('https://chronik.e.cash');

  constructor(private readonly carteraService: CarteraService) {
    void this.ensureWalletInfo().catch(() => undefined);
  }

  get address(): string | null {
    if (this.client) {
      const candidate = this.getWalletAddress(this.client);
      if (candidate) {
        return candidate;
      }
    }

    return this.walletInfo?.address ?? null;
  }

  private async ensureClient(): Promise<Wallet> {
    const wallet = await this.ensureWalletInfo();

    if (!this.client) {
      const client = await Wallet.fromMnemonic(
        this.normalizeMnemonic(wallet.mnemonic),
        this.chronik,
      );
      this.client = client;

      const derivedAddress = this.getWalletAddress(client);
      if (derivedAddress && (!wallet.address || wallet.address !== derivedAddress)) {
        this.walletInfo = { ...wallet, address: derivedAddress };
      }
    }

    return this.client;
  }

  private async ensureWalletInfo(): Promise<WalletInfo> {
    if (!this.walletInfo) {
      const info = await this.carteraService.getWalletInfo();
      if (!info) {
        throw new Error('No se encontró una cartera configurada.');
      }
      if (!info.mnemonic) {
        throw new Error('La cartera no contiene una frase mnemónica válida.');
      }
      this.walletInfo = info;
    }

    return this.walletInfo;
  }

  async enviar(toAddress: string, amount: number): Promise<{ txid: string }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El monto a enviar debe ser mayor que cero.');
    }

    const client = await this.ensureClient();
    const satsAmount = this.xecToSats(amount);

    const tx = await client.createTx({
      to: toAddress,
      amount: satsAmount,
    });

    const broadcastResult = await client.broadcastTx(tx);
    const txid = this.extractTxid(broadcastResult);

    if (!txid) {
      throw new Error('La transacción no devolvió un identificador.');
    }

    return { txid };
  }

  clearCache(): void {
    this.client = null;
    this.walletInfo = null;
  }

  private normalizeMnemonic(mnemonic: string): string {
    return mnemonic
      .trim()
      .split(/\s+/u)
      .map((word) => word.toLowerCase())
      .join(' ');
  }

  private xecToSats(amount: number): number {
    return Math.round(amount * SATS_PER_XEC);
  }

  private extractTxid(result: unknown): string | null {
    if (typeof result === 'string') {
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

  private getWalletAddress(wallet: Wallet): string | null {
    const getAddress = (wallet as { getAddress?: () => string }).getAddress;
    if (typeof getAddress === 'function') {
      const address = getAddress.call(wallet);
      if (address) {
        return address;
      }
    }

    const legacyAddress = (wallet as { address?: string }).address;
    return typeof legacyAddress === 'string' ? legacyAddress : null;
  }
}
