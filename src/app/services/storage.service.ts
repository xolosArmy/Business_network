import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private db!: IDBDatabase;

  async initDB() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('RMZWalletDB', 1);

      request.onupgradeneeded = (event: any) => {
        this.db = event.target.result;
        if (!this.db.objectStoreNames.contains('transactions')) {
          this.db.createObjectStore('transactions', { keyPath: 'txid' });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = () => reject('IndexedDB init failed');
    });
  }

  saveTx(tx: any) {
    const txStore = this.db.transaction('transactions', 'readwrite').objectStore('transactions');
    txStore.put(tx);
  }

  async getAllTxs(): Promise<any[]> {
    return new Promise((resolve) => {
      const txStore = this.db.transaction('transactions', 'readonly').objectStore('transactions');
      const req = txStore.getAll();
      req.onsuccess = () => resolve(req.result);
    });
  }
}
