// src/app/services/cartera.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getSharedInstance } from '../utils/key-derivation.adapter';

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

@Injectable({ providedIn: 'root' })
export class CarteraService {
  readonly state$ = new BehaviorSubject<CarteraState>({ balance: 0 });

  // Nueva API interna
  async crearNuevaCartera(): Promise<void> {
    const kd = await getSharedInstance();

    // No pases parámetro de bits; la lib maneja default
    const mnemonic = await kd.generateMnemonic();
    const keys = await kd.deriveKeysFromMnemonic(mnemonic);

    const addr =
      keys?.address ??
      keys?.cashaddr ??
      keys?.xecaddr ??
      keys?.p2pkh ??
      '(sin dirección)';

    this.state$.next({
      address: addr,
      mnemonic, // <- guardamos para que HomePage y enviar.service puedan leerlo
      mnemonicPreview: mnemonic.split(' ').slice(0, 3).join(' ') + ' …',
      balance: 0,
    });

    console.log('[RMZWallet] MNEMONIC', mnemonic);
    console.log('[RMZWallet] KEYS', keys);
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
