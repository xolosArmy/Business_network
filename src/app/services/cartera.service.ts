import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  Address,
  HdNode,
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
} from 'ecash-lib';
import { wordlist as ENGLISH_WORDLIST } from '@scure/bip39/wordlists/english';

export interface WalletInfo {
  mnemonic: string;
  address: string;
  publicKey: string;
  privateKey: string;
}

const WORDLIST = { words: ENGLISH_WORDLIST, separator: ' ' } as const;
const DERIVATION_PATH = "m/44'/899'/0'/0/0";
const STORAGE_KEY = 'rmz_wallet';

@Injectable({ providedIn: 'root' })
export class CarteraService {
  private cachedWallet: WalletInfo | null = null;

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
        return this.cachedWallet;
      }
    } catch (error) {
      console.warn('No se pudo cargar la cartera almacenada', error);
    }

    return null;
  }

  private generateMnemonic(): string {
    const entropy = this.getRandomBytes(16);
    return entropyToMnemonic(entropy, WORDLIST);
  }

  private async buildWalletFromMnemonic(mnemonic: string): Promise<WalletInfo> {
    const seed = await mnemonicToSeed(mnemonic);
    const master = HdNode.fromSeed(seed);
    const accountNode = master.derivePath(DERIVATION_PATH);

    const privateKey = accountNode.seckey();
    const publicKey = accountNode.pubkey();
    const pubKeyHash = accountNode.pkh();

    if (!privateKey) {
      throw new Error('No se pudo derivar la clave privada.');
    }

    const address = Address.p2pkh(pubKeyHash).address;

    return {
      mnemonic,
      address,
      publicKey: this.bytesToHex(publicKey),
      privateKey: this.bytesToHex(privateKey),
    };
  }

  private validateMnemonic(mnemonic: string): void {
    try {
      mnemonicToEntropy(mnemonic, WORDLIST);
    } catch (error) {
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

  private async persistWallet(wallet: WalletInfo): Promise<WalletInfo> {
    this.cachedWallet = wallet;
    try {
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(wallet) });
    } catch (error) {
      console.warn('No se pudo almacenar la cartera localmente', error);
    }
    return wallet;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private getRandomBytes(length: number): Uint8Array {
    if (length <= 0) {
      throw new Error('El tamaño de la entropía debe ser mayor que cero.');
    }

    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint8Array(length));
    }

    throw new Error('Entorno sin soporte para generación de números aleatorios criptográficos.');
  }
}
