import { Injectable } from '@angular/core';
import type { WalletInfo } from './cartera.service';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface StoredTransaction {
  id?: number;
  description: string;
  amount: number;
  date: string;
  status: TransactionStatus;
  txid?: string;
  destination?: string;
  errorMessage?: string;
  payload?: {
    destination: string;
    amount: number;
  };
}

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private readonly dbName = 'rmz-wallet-offline';
  private readonly stateStore = 'state';
  private readonly transactionsStore = 'transactions';
  private readonly dbVersion = 1;
  private readonly isSupported = typeof indexedDB !== 'undefined';
  private readonly dbPromise: Promise<IDBDatabase> | null;

  private readonly memoryState = new Map<string, unknown>();
  private memoryTransactions: StoredTransaction[] = [];
  private memoryTransactionId = 1;

  constructor() {
    this.dbPromise = this.isSupported ? this.openDatabase() : null;
  }

  async getWallet(): Promise<WalletInfo | null> {
    return (await this.getStateItem<WalletInfo>('wallet')) ?? null;
  }

  async setWallet(wallet: WalletInfo): Promise<void> {
    await this.setStateItem('wallet', wallet);
  }

  async clearWallet(): Promise<void> {
    await this.deleteStateItem('wallet');
  }

  async getCachedBalance(): Promise<number | null> {
    return (await this.getStateItem<number>('balance')) ?? null;
  }

  async setCachedBalance(balance: number): Promise<void> {
    await this.setStateItem('balance', balance);
  }

  async getTransactions(): Promise<StoredTransaction[]> {
    if (!this.dbPromise) {
      return this.memoryTransactions.map((item) => ({ ...item }));
    }

    const db = await this.dbPromise;
    return new Promise<StoredTransaction[]>((resolve, reject) => {
      const tx = db.transaction(this.transactionsStore, 'readonly');
      const store = tx.objectStore(this.transactionsStore);
      const request = store.getAll();
      request.onsuccess = () => {
        const result = (request.result as StoredTransaction[]).map((item) => ({ ...item }));
        resolve(this.sortTransactions(result));
      };
      request.onerror = () => reject(request.error ?? new Error('Error leyendo transacciones offline.'));
    });
  }

  async saveTransactions(transactions: StoredTransaction[]): Promise<void> {
    if (!this.dbPromise) {
      const assigned = transactions.map((item) => {
        const id = item.id ?? this.memoryTransactionId++;
        this.memoryTransactionId = Math.max(this.memoryTransactionId, id + 1);
        return { ...item, id };
      });
      this.memoryTransactions = this.sortTransactions(assigned);
      return;
    }

    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.transactionsStore, 'readwrite');
      const store = tx.objectStore(this.transactionsStore);
      const clearRequest = store.clear();
      clearRequest.onerror = () => reject(clearRequest.error ?? new Error('Error al limpiar transacciones.'));
      clearRequest.onsuccess = () => {
        Promise.all(
          transactions.map(
            (transaction) =>
              new Promise<void>((res, rej) => {
                const record = { ...transaction };
                const request = store.add(record);
                request.onsuccess = () => {
                  res();
                };
                request.onerror = () => rej(request.error ?? new Error('No se pudo guardar una transacción offline.'));
              }),
          ),
        )
          .then(() => resolve())
          .catch(reject);
      };
    });
  }

  async addTransaction(transaction: StoredTransaction): Promise<StoredTransaction> {
    if (!this.dbPromise) {
      const assignedId = transaction.id ?? this.memoryTransactionId++;
      this.memoryTransactionId = Math.max(this.memoryTransactionId, assignedId + 1);
      const record: StoredTransaction = {
        ...transaction,
        id: assignedId,
      };
      this.memoryTransactions = this.sortTransactions([
        ...this.memoryTransactions.filter((item) => item.id !== record.id),
        record,
      ]);
      return { ...record };
    }

    const db = await this.dbPromise;
    return new Promise<StoredTransaction>((resolve, reject) => {
      const tx = db.transaction(this.transactionsStore, 'readwrite');
      const store = tx.objectStore(this.transactionsStore);
      const record = { ...transaction };
      delete record.id;
      const request = store.add(record);
      request.onsuccess = () => {
        const id = Number(request.result);
        resolve({ ...record, id });
      };
      request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la transacción offline.'));
    });
  }

  async updateTransaction(id: number, changes: Partial<StoredTransaction>): Promise<void> {
    if (!this.dbPromise) {
      this.memoryTransactions = this.memoryTransactions.map((item) =>
        item.id === id ? { ...item, ...changes, id } : item,
      );
      return;
    }

    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.transactionsStore, 'readwrite');
      const store = tx.objectStore(this.transactionsStore);
      const getRequest = store.get(id);
      getRequest.onerror = () => reject(getRequest.error ?? new Error('No se pudo leer la transacción.'));
      getRequest.onsuccess = () => {
        const record = getRequest.result as StoredTransaction | undefined;
        if (!record) {
          resolve();
          return;
        }
        const updated = { ...record, ...changes, id };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error ?? new Error('No se pudo actualizar la transacción.'));
      };
    });
  }

  async getPendingTransactions(): Promise<StoredTransaction[]> {
    const transactions = await this.getTransactions();
    return transactions.filter((transaction) => transaction.status === 'pending');
  }

  private async getStateItem<T>(key: string): Promise<T | undefined> {
    if (!this.dbPromise) {
      return this.memoryState.get(key) as T | undefined;
    }

    const db = await this.dbPromise;
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(this.stateStore, 'readonly');
      const store = tx.objectStore(this.stateStore);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error('No se pudo leer el estado offline.'));
    });
  }

  private async setStateItem<T>(key: string, value: T): Promise<void> {
    if (!this.dbPromise) {
      this.memoryState.set(key, value);
      return;
    }

    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.stateStore, 'readwrite');
      const store = tx.objectStore(this.stateStore);
      const request = store.put(value as any, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('No se pudo guardar el estado offline.'));
    });
  }

  private async deleteStateItem(key: string): Promise<void> {
    if (!this.dbPromise) {
      this.memoryState.delete(key);
      return;
    }

    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.stateStore, 'readwrite');
      const store = tx.objectStore(this.stateStore);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('No se pudo eliminar el estado offline.'));
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.stateStore)) {
          db.createObjectStore(this.stateStore);
        }
        if (!db.objectStoreNames.contains(this.transactionsStore)) {
          db.createObjectStore(this.transactionsStore, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo inicializar IndexedDB.'));
    });
  }

  private sortTransactions(transactions: StoredTransaction[]): StoredTransaction[] {
    return transactions
      .map((transaction) => ({ ...transaction }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}
