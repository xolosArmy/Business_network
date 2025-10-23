import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';

import { CHRONIK_URL } from './chronik.constants';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private wallet?: Wallet;
  private readonly chronikClient: ChronikClient = new ChronikClient(CHRONIK_URL);

  async loadFromMnemonic(mnemonic: string): Promise<Wallet> {
    this.wallet = await Wallet.fromMnemonic(mnemonic, this.chronikClient);
    return this.wallet;
  }

  async enviar(toAddress: string, amountSats: number): Promise<string> {
    // TODO: Implementar con la API actual de ecash-wallet.
    // Por ahora, deja un placeholder que no rompa la compilación.
    console.warn('[WalletService.enviar] Implementación pendiente', { toAddress, amountSats });
    return Promise.resolve('pending-impl');
  }

  getAddress(): string {
    if (!this.wallet) {
      throw new Error('Wallet no inicializada');
    }
    return this.wallet.address;
  }

  async getBalance(addressOrWallet?: string | { address: string }): Promise<number> {
    const address = typeof addressOrWallet === 'string'
      ? addressOrWallet
      : addressOrWallet?.address ?? this.wallet?.address;

    if (!address) {
      throw new Error('Wallet no inicializada y no se proporcionó dirección');
    }

    const chronikAddress = this.chronikClient.address(address);
    const { utxos } = await chronikAddress.utxos();
    return utxos.reduce((sum: number, utxo: any) => {
      const sats = typeof utxo.sats === 'bigint' ? Number(utxo.sats) : Number(utxo.sats ?? 0);
      return sum + (Number.isFinite(sats) ? sats : 0);
    }, 0);
  }

  async createAndBroadcastTx(_toAddress: string, _amountSats: number): Promise<string> {
    throw new Error('createAndBroadcastTx: implementar usando tu flujo de envío (enviar.service o ecash-lib)');
  }

  async signTx(_toAddress: string, _amountSats: number): Promise<string> {
    throw new Error('signTx: implementar firma de TX si la necesitas por BLE');
  }
}
