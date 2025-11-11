// src/app/services/cartera.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  generateMnemonicAsync,
  validateMnemonicAsync,
  deriveKeysFromMnemonicAsync,
  getSharedInstance,
} from '../utils/key-derivation.adapter';

export interface CarteraState {
  address?: string;
  mnemonic?: string;          // <- guardamos la frase completa en memoria (ojo: solo dev!)
  mnemonicPreview?: string;
  balance?: number;
}

// Compat con código existente:
export interface WalletInfo {
  address: string;
  balance: number;
  mnemonic?: string;          // <- añadimos campo opcional que la UI actual espera
}

const DEFAULT_HD_PATH = "m/44'/899'/0'/0/0";

@Injectable({ providedIn: 'root' })
export class CarteraService {
  readonly state$ = new BehaviorSubject<CarteraState>({ balance: 0 });

  // Nueva API interna
  async crearNuevaCartera(): Promise<void> {
    const mnemonic = await generateMnemonicAsync();
    const isValid = await validateMnemonicAsync(mnemonic);
    if (!isValid) {
      throw new Error('No se pudo generar un mnemónico válido.');
    }

    const { seedHex } = await deriveKeysFromMnemonicAsync(mnemonic);

    const kd = await getSharedInstance();
    let derivedKeys: any | null = null;

    try {
      if (typeof kd.createForMnemonic === 'function') {
        const wallet = await kd.createForMnemonic(mnemonic);
        derivedKeys = typeof wallet?.derive === 'function' ? wallet.derive(DEFAULT_HD_PATH) : wallet;
      } else if (typeof kd.deriveKeysFromMnemonic === 'function') {
        derivedKeys = await kd.deriveKeysFromMnemonic(mnemonic);
      }
    } catch (error) {
      console.warn('[RMZWallet] No se pudo derivar la dirección desde KeyDerivation.', error);
    }

    const addr =
      derivedKeys?.address ??
      derivedKeys?.cashaddr ??
      derivedKeys?.xecaddr ??
      derivedKeys?.cashAddress ??
      derivedKeys?.xecAddress ??
      derivedKeys?.p2pkh ??
      '(sin dirección)';

    this.state$.next({
      address: addr,
      mnemonic, // <- guardamos para que HomePage y enviar.service puedan leerlo
      mnemonicPreview: mnemonic.split(' ').slice(0, 3).join(' ') + ' …',
      balance: 0,
    });

    console.log('[RMZWallet] MNEMONIC', mnemonic);
    console.log('[RMZWallet] seedHex', seedHex);
    console.log('[RMZWallet] KEYS', derivedKeys);
  }

  // ---------- Compatibilidad (API legacy) ----------

  /** API legacy: getWalletInfo() */
  async getWalletInfo(): Promise<WalletInfo> {
    const s = this.state$.value;
    return {
      address: s.address ?? '',
      balance: s.balance ?? 0,
      mnemonic: s.mnemonic, // <- incluimos mnemonic
    };
  }

  /** API legacy: createWallet() -> crea y regresa WalletInfo */
  async createWallet(): Promise<WalletInfo> {
    await this.crearNuevaCartera();
    return this.getWalletInfo();
  }

  /**
   * API legacy: sendRMZToken(dest, amount).
   * Stub temporal para no romper la UI; integrar envío real después.
   */
  async sendRMZToken(
    destination: string,
    amount: number
  ): Promise<{ ok: boolean; txid?: string; reason?: string }> {
    console.warn('[RMZWallet] sendRMZToken(): stub no implementado todavía', { destination, amount });
    return { ok: false, reason: 'not-implemented' };
  }
}
