import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';

type WalletSource = Pick<WalletInfo, 'mnemonic' | 'address'> | { mnemonic: string; address?: string };

const DEFAULT_CHRONIK_URL = 'https://chronik.e.cash';
const SATS_PER_XEC = 100n;

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient([DEFAULT_CHRONIK_URL]);

  async getBalance(walletSource: WalletSource): Promise<number> {
    const mnemonic = walletSource?.mnemonic?.trim();
    if (!mnemonic) {
      throw new Error('La frase mnemónica es obligatoria para consultar el saldo.');
    }

    const wallet = Wallet.fromMnemonic(mnemonic, this.chronik);
    await wallet.sync();

    const spendable = wallet.spendableSatsOnlyUtxos();
    const totalSats = spendable.reduce<bigint>((total, utxo) => {
      const value = utxo.sats;
      return total + (typeof value === 'bigint' ? value : BigInt(value));
    }, 0n);

    return Number(totalSats) / Number(SATS_PER_XEC);
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
