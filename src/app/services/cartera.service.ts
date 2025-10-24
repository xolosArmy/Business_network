import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import KeyDerivation from 'minimal-xec-wallet/lib/key-derivation';

import { OfflineStorageService } from './offline-storage.service';
import { RMZ_TOKEN_ID } from './chronik.constants';
import { TokenBalance, TokenManagerService } from './token-manager.service';

export interface WalletInfo {
  mnemonic: string;
  address: string;
  publicKey: string;
  privateKey: string;
}

const DEFAULT_DERIVATION_PATH = "m/44'/899'/0'/0/0";
const STORAGE_KEY = 'rmz_wallet';
@Injectable({ providedIn: 'root' })
export class CarteraService {
  private cachedWallet: WalletInfo | null = null;
  private readonly keyDerivation = new KeyDerivation();

  constructor(
    private readonly offlineStorage: OfflineStorageService,
    private readonly tokenManager: TokenManagerService,
  ) {}

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

  async getRmzTokenBalance(): Promise<TokenBalance | null> {
    const wallet = await this.getWalletInfo();
    if (!wallet?.address) {
      return null;
    }

    try {
      return await this.tokenManager.getTokenBalance(RMZ_TOKEN_ID, wallet.address);
    } catch (error) {
      console.warn('No se pudo obtener el balance del token RMZ', error);
      return null;
    }
  }

  private validateMnemonic(mnemonic: string): void {
    if (!this.keyDerivation.validateMnemonic(mnemonic)) {
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
    return this.keyDerivation.generateMnemonic(128);
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

  private async buildWalletFromMnemonic(mnemonic: string): Promise<WalletInfo> {
    const { address, publicKey, privateKey } = this.keyDerivation.deriveFromMnemonic(
      mnemonic,
      DEFAULT_DERIVATION_PATH,
    );

    if (!address || !publicKey || !privateKey) {
      throw new Error('No se pudo derivar la información de la cartera.');
    }

    return {
      mnemonic,
      address,
      publicKey,
      privateKey,
    };
  }
}
