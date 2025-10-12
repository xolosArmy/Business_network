import { Injectable } from '@angular/core';
import { ChronikClient, Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';

const SATS_PER_XEC = 100;

type WalletSource =
  | Pick<WalletInfo, 'mnemonic' | 'address'>
  | { mnemonic: string; address?: string };

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private readonly chronik = new ChronikClient('https://chronik.be.cash/xec');

  async getBalance(walletSource: WalletSource): Promise<number> {
    const mnemonic = walletSource?.mnemonic?.trim();
    if (!mnemonic) {
      throw new Error('La frase mnemónica es obligatoria para consultar el saldo.');
    }

    const wallet = await this.createWallet(mnemonic);
    const address = this.resolveAddress(wallet, walletSource.address);

    if (!address) {
      throw new Error('No se pudo determinar la dirección de la cartera.');
    }

    const utxosResponse = await this.chronik.address(address).utxos();
    const balanceSats = utxosResponse.utxos.reduce<bigint>(
      (total: bigint, utxo: { sats: unknown }) => total + this.parseSats(utxo.sats),
      0n,
    );

    const balance = Number(balanceSats) / SATS_PER_XEC;

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

  private async createWallet(mnemonic: string): Promise<Wallet> {
    const normalizedMnemonic = this.normalizeMnemonic(mnemonic);
    return await Wallet.fromMnemonic(normalizedMnemonic, this.chronik);
  }

  private normalizeMnemonic(mnemonic: string): string {
    return mnemonic
      .trim()
      .split(/\s+/u)
      .map((word: string) => word.toLowerCase())
      .join(' ');
  }

  private resolveAddress(wallet: Wallet, fallback?: string): string | null {
    const getAddress = (wallet as { getAddress?: () => string }).getAddress;
    if (typeof getAddress === 'function') {
      const derived = getAddress.call(wallet);
      if (derived) {
        return derived;
      }
    }

    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback.trim();
    }

    const legacyAddress = (wallet as { address?: string }).address;
    return typeof legacyAddress === 'string' ? legacyAddress : null;
  }

  private parseSats(value: unknown): bigint {
    if (typeof value === 'bigint') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(Math.round(value));
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        return BigInt(value.trim());
      } catch {
        return 0n;
      }
    }

    return 0n;
  }

}
