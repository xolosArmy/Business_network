import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist as ENGLISH_WORDLIST } from '@scure/bip39/wordlists/english.js';

import { OfflineStorageService } from './offline-storage.service';
import { CHRONIK_URL } from './chronik.constants';

export interface WalletInfo {
  mnemonic: string;
  address: string;
  publicKey: string;
  privateKey: string;
}

const WORDS = ENGLISH_WORDLIST;
const STORAGE_KEY = 'rmz_wallet';
@Injectable({ providedIn: 'root' })
export class CarteraService {
  private cachedWallet: WalletInfo | null = null;
  private readonly chronikClient: ChronikClient = new ChronikClient([
    CHRONIK_URL,
  ]);

  constructor(private readonly offlineStorage: OfflineStorageService) {}

  async createWallet(): Promise<WalletInfo> {
    const mnemonic = this.generateMnemonic();
    const wallet = await this.buildWalletFromMnemonic(mnemonic);
    return this.persistWallet(wallet);
  }

  async importWallet(mnemonic: string): Promise<WalletInfo> {
    const normalized = this.normalizeMnemonic(mnemonic);
    this.validateMnemonic(normalized);
    const wallet = await this.buildWalletFromMnemonic(normalized);
    return this.persistWallet(wallet);
  }

  async getWalletInfo(): Promise<WalletInfo | null> {
    if (this.cachedWallet) {
      return this.cachedWallet;
    }

    try {
      const offlineWallet = await this.offlineStorage.getWallet();
      if (offlineWallet) {
        this.cachedWallet = offlineWallet;
        return this.cachedWallet;
      }
    } catch (error) {
      console.warn('No se pudo recuperar la cartera de IndexedDB', error);
    }

    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value) as Partial<WalletInfo>;
      if (
        typeof parsed?.mnemonic === 'string' &&
        typeof parsed?.address === 'string' &&
        typeof parsed?.publicKey === 'string' &&
        typeof parsed?.privateKey === 'string'
      ) {
        this.cachedWallet = parsed as WalletInfo;
        await this.offlineStorage.setWallet(this.cachedWallet);
        return this.cachedWallet;
      }
    } catch (error) {
      console.warn('No se pudo cargar la cartera almacenada', error);
    }

    return null;
  }

  private async buildWalletFromMnemonic(mnemonic: string): Promise<WalletInfo> {
    const wallet = Wallet.fromMnemonic(mnemonic, this.chronikClient);

    const address = wallet.address;
    const publicKey = wallet.pk;
    const privateKey = wallet.sk;

    if (!address || !publicKey || !privateKey) {
      throw new Error('No se pudo derivar la información de la cartera.');
    }

    return {
      mnemonic,
      address,
      publicKey: this.bytesToHex(publicKey),
      privateKey: this.bytesToHex(privateKey),
    };
  }

  private validateMnemonic(mnemonic: string): void {
    if (!validateMnemonic(mnemonic, WORDS)) {
      throw new Error('La frase mnemónica proporcionada no es válida.');
    }
  }

  private normalizeMnemonic(mnemonic: string): string {
    return mnemonic
      .trim()
      .split(/\s+/u)
      .map((word) => word.toLowerCase())
      .join(' ');
  }

  private generateMnemonic(): string {
    return generateMnemonic(WORDS, 128);
  }

  private async persistWallet(wallet: WalletInfo): Promise<WalletInfo> {
    this.cachedWallet = wallet;
    try {
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(wallet) });
    } catch (error) {
      console.warn('No se pudo almacenar la cartera localmente', error);
    }

    try {
      await this.offlineStorage.setWallet(wallet);
    } catch (error) {
      console.warn('No se pudo almacenar la cartera en IndexedDB', error);
    }

    return wallet;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

}
