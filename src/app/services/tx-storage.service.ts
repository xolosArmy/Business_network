import { Injectable } from '@angular/core';

export interface StoredTx {
  id: string;
  type: 'sent' | 'received';
  from: string;
  to: string;
  amount: number;
  status: 'pending' | 'signed' | 'broadcasted';
  timestamp: string;
  raw?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TxStorageService {
  private readonly STORAGE_KEY = 'rmz_tx_history';

  getAll(): StoredTx[] {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
  }

  save(tx: StoredTx) {
    const txs = this.getAll();
    txs.unshift(tx);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
  }

  update(id: string, updates: Partial<StoredTx>) {
    const txs = this.getAll();
    const idx = txs.findIndex(t => t.id === id);
    if (idx !== -1) {
      txs[idx] = { ...txs[idx], ...updates } as StoredTx;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
    }
  }

  updateStatus(id: string, newStatus: StoredTx['status']) {
    this.update(id, { status: newStatus });
  }

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
