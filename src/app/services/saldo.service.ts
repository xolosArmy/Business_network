import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';

type WalletSource =
  | Pick<WalletInfo, 'mnemonic' | 'address' | 'privateKey'>
  | { mnemonic: string; privateKey: string; address?: string };

@Injectable({ providedIn: 'root' })
export class SaldoService {
  async getBalance(walletSource: WalletSource): Promise<number> {
    const mnemonic = walletSource?.mnemonic?.trim();
    if (!mnemonic) {
      throw new Error('La frase mnemónica es obligatoria para consultar el saldo.');
    }

    const privateKey = walletSource?.privateKey?.trim();
    if (!privateKey) {
      throw new Error('La llave privada es obligatoria para consultar el saldo.');
    }

    const wallet = new Wallet(privateKey);
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

}
