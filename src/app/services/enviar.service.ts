import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import type { WalletInfo } from './cartera.service';
import {
  OfflineStorageService,
  StoredTransaction,
} from './offline-storage.service';
import { StorageService } from './storage.service';

const chronik = new ChronikClient('https://chronik.e.cash');
const SATS_PER_XEC = 100;

type WalletSource =
  | Pick<WalletInfo, 'mnemonic' | 'address' | 'privateKey'>
  | { mnemonic: string; privateKey: string; address?: string };

@Injectable({ providedIn: 'root' })
export class EnviarService {
  private isProcessingPending = false;

  constructor(
    private readonly offlineStorage: OfflineStorageService,
    private readonly storage: StorageService,
  ) {
    if (typeof window !== 'undefined') {
      void this.storage
        .initDB()
        .catch((error) => console.error('IndexedDB init failed', error));
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.processPendingTransactions();
      });
    }
  }

  async sendTransaction(fromWallet: WalletSource, toAddress: string, amount: number): Promise<string> {
    try {
      const mnemonic = fromWallet?.mnemonic?.trim();
      if (!mnemonic) {
        throw new Error('La cartera de origen debe incluir la frase mnemónica.');
      }
      const privateKey = fromWallet?.privateKey?.trim();
      if (!privateKey) {
        throw new Error('La cartera de origen debe incluir la llave privada.');
      }
      const destination = toAddress?.trim();
      if (!destination) {
        throw new Error('La dirección de destino es obligatoria.');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('El monto a enviar debe ser mayor que cero.');
      }

      const timestamp = new Date().toISOString();
      const { connected } = await this.getNetworkStatus();

      if (!connected) {
        const tx = {
          toAddress: destination,
          amount,
          txid: Date.now().toString(),
          pending: true,
        };
        this.storage.saveTx(tx);
        await this.queueTransaction(destination, amount, timestamp);
        console.log('Transacción guardada localmente (offline).');
        return `pending-offline-${tx.txid}`;
      }

      const wallet = await this.createWallet(privateKey);
      await wallet.sync();

      const txid = await this.sendWithWallet(wallet, destination, amount);

      await this.offlineStorage.addTransaction({
        description: `Envío a ${destination}`,
        amount: -amount,
        date: timestamp,
        status: 'confirmed',
        txid,
        destination,
      });

      return txid;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.offlineStorage.addTransaction({
        description: `Error al enviar a ${toAddress}`,
        amount: -amount,
        date: new Date().toISOString(),
        status: 'failed',
        destination: toAddress,
        errorMessage: message,
      });
      throw new Error(`No se pudo enviar la transacción: ${message}`);
    }
  }

  private async getNetworkStatus(): Promise<{ connected: boolean }> {
    try {
      if (typeof Network?.getStatus === 'function') {
        return await Network.getStatus();
      }
    } catch (error) {
      console.warn('No se pudo obtener el estado de la red con Capacitor Network.', error);
    }

    const isConnected = typeof navigator === 'undefined' ? true : navigator.onLine;
    return { connected: isConnected };
  }

  async processPendingTransactions(): Promise<void> {
    if (this.isProcessingPending) {
      return;
    }

    this.isProcessingPending = true;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      const wallet = await this.offlineStorage.getWallet();
      if (!wallet?.privateKey) {
        return;
      }

      const pendingTransactions = await this.offlineStorage.getPendingTransactions();
      if (!pendingTransactions.length) {
        return;
      }

      const walletInstance = await this.createWallet(wallet.privateKey);
      await walletInstance.sync();

      for (const transaction of pendingTransactions) {
        await this.processPendingTransaction(walletInstance, transaction);
      }
    } finally {
      this.isProcessingPending = false;
    }
  }

  private async queueTransaction(destination: string, amount: number, date: string): Promise<StoredTransaction> {
    return this.offlineStorage.addTransaction({
      description: `Envío pendiente a ${destination}`,
      amount: -amount,
      date,
      status: 'pending',
      destination,
      payload: { destination, amount },
    });
  }

  private async processPendingTransaction(wallet: Wallet, transaction: StoredTransaction): Promise<void> {
    if (!transaction.id) {
      return;
    }

    if (!transaction.payload?.destination || !Number.isFinite(transaction.payload.amount)) {
      await this.offlineStorage.updateTransaction(transaction.id, {
        status: 'failed',
        errorMessage: 'Información incompleta para sincronizar la transacción.',
      });
      return;
    }

    try {
      const txid = await this.sendWithWallet(
        wallet,
        transaction.payload.destination,
        transaction.payload.amount,
      );

      await this.offlineStorage.updateTransaction(transaction.id, {
        status: 'confirmed',
        txid,
        date: new Date().toISOString(),
        payload: undefined,
        errorMessage: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Error desconocido al sincronizar.');
      await this.offlineStorage.updateTransaction(transaction.id, {
        status: 'failed',
        errorMessage: message,
      });
    }
  }

  private async createWallet(privateKeyHex: string): Promise<Wallet> {
    const normalizedKey = this.normalizePrivateKey(privateKeyHex);
    return Wallet.fromPrivateKey(normalizedKey, chronik);
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

  private xecToSats(amount: number): bigint {
    if (!Number.isFinite(amount)) {
      throw new Error('El monto proporcionado no es válido.');
    }

    const sats = Math.round(amount * SATS_PER_XEC);
    return BigInt(sats);
  }

  private async sendWithWallet(wallet: Wallet, destination: string, amountXec: number): Promise<string> {
    const satsAmount = this.xecToSats(amountXec);

    if (satsAmount <= 0n) {
      throw new Error('El monto convertido a satoshis debe ser mayor que cero.');
    }

    const action = wallet.action({
      outputs: [
        {
          address: destination,
          sats: satsAmount,
        },
      ],
    });

    const builtAction = action.build();
    const result = await builtAction.broadcast();

    if (!result.success || !Array.isArray(result.broadcasted) || result.broadcasted.length === 0) {
      const details = Array.isArray(result.errors) && result.errors.length
        ? result.errors.join('; ')
        : 'No se pudo transmitir la transacción.';
      throw new Error(details);
    }

    return result.broadcasted[0];
  }
}
