import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';
import {
  OfflineStorageService,
  StoredTransaction,
} from './offline-storage.service';

type WalletSource =
  | Pick<WalletInfo, 'mnemonic' | 'address' | 'privateKey'>
  | { mnemonic: string; privateKey: string; address?: string };

@Injectable({ providedIn: 'root' })
export class EnviarService {
  private isProcessingPending = false;

  constructor(private readonly offlineStorage: OfflineStorageService) {
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
      const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

      if (!isOnline) {
        await this.queueTransaction(destination, amount, timestamp);
        return `pending-offline-${Date.now()}`;
      }

      const wallet = new Wallet(privateKey);

      const txid = await wallet.send(destination, amount);
      if (!txid) {
        throw new Error('No se recibió el identificador de la transacción.');
      }

      await this.offlineStorage.addTransaction({
        description: `Envío a ${destination}`,
        amount: -amount,
        date: timestamp,
        status: 'confirmed',
        txid: String(txid),
        destination,
      });

      return String(txid);
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

      const walletInstance = new Wallet(wallet.privateKey);

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
      const txid = await wallet.send(transaction.payload.destination, transaction.payload.amount);
      if (!txid) {
        throw new Error('El identificador de la transacción está vacío.');
      }

      await this.offlineStorage.updateTransaction(transaction.id, {
        status: 'confirmed',
        txid: String(txid),
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
}
