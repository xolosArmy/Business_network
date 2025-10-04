import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface StoredTx {
  id: string;
  type: 'sent' | 'received';
  from: string;
  to: string;
  amount: number;
  status: 'pending' | 'signed' | 'broadcasted' | 'confirmed' | 'failed';
  timestamp: string;
  raw?: string;
  txid?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TxStorageService {
  private readonly STORAGE_KEY = 'rmz_tx_history';
  private txSubject = new BehaviorSubject<StoredTx[]>(this.getAll());

  tx$ = this.txSubject.asObservable();

  getAll(): StoredTx[] {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
  }

  private emitChange() {
    const txs = this.getAll();
    this.txSubject.next(txs);
  }

  save(tx: StoredTx) {
    const txs = this.getAll();
    txs.unshift(tx);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
    this.emitChange();
  }

  update(id: string, changes: Partial<StoredTx>) {
    const txs = this.getAll();
    const idx = txs.findIndex(t => t.id === id);
    if (idx !== -1) {
      txs[idx] = { ...txs[idx], ...changes };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
      this.emitChange();
    }
  }

  updateByTxid(txid: string, changes: Partial<StoredTx>) {
    const txs = this.getAll();
    const idx = txs.findIndex(t => t.txid === txid);
    if (idx !== -1) {
      txs[idx] = { ...txs[idx], ...changes };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
      this.emitChange();
    }
  }

  updateStatus(id: string, newStatus: StoredTx['status']) {
    this.update(id, { status: newStatus });
  }

  updateStatusByTxid(txid: string, newStatus: StoredTx['status']) {
    this.updateByTxid(txid, { status: newStatus });
  }

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.emitChange();
  }
}
