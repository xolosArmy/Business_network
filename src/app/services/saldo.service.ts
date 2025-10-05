import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';

type WalletSource =
  | Pick<WalletInfo, 'mnemonic' | 'address' | 'privateKey'>
  | { mnemonic: string; privateKey: string; address?: string };

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient('https://chronik.e.cash');

  async getBalance(walletSource: WalletSource): Promise<number> {
    const mnemonic = walletSource?.mnemonic?.trim();
    if (!mnemonic) {
      throw new Error('La frase mnemónica es obligatoria para consultar el saldo.');
    }

    const privateKey = walletSource?.privateKey?.trim();
    if (!privateKey) {
      throw new Error('La llave privada es obligatoria para consultar el saldo.');
    }

    const wallet = await Wallet.fromPrivateKey(this.normalizePrivateKey(privateKey), this.chronik);
    await wallet.sync();
    const balance = await wallet.getBalance();

    if (!Number.isFinite(balance)) {
      throw new Error('No se pudo obtener el saldo de la cartera.');
    }

    return balance;
  }

  formatBalance(balance: number): string {
    if (!Number.isFinite(balance)) {
      return '0.00';
    }

    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balance);
  }

  private normalizePrivateKey(hex: string): string {
    const normalized = hex.trim().replace(/^0x/i, '');
    if (!normalized || normalized.length % 2 !== 0) {
      throw new Error('La llave privada tiene un formato inválido.');
    }

    for (let index = 0; index < normalized.length; index += 2) {
      const byte = Number.parseInt(normalized.slice(index, index + 2), 16);
      if (Number.isNaN(byte)) {
        throw new Error('La llave privada tiene un formato inválido.');
      }
    }

    return normalized;
  }

}
