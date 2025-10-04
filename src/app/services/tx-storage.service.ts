import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type StoredTxStatus =
  | 'queued'
  | 'pending'
  | 'signed'
  | 'broadcasting'
  | 'broadcasted'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export interface StoredTxHistoryEntry {
  status: StoredTxStatus;
  timestamp: string;
  reason?: string;
}

export interface StoredTx {
  id: string;
  type: 'sent' | 'received';
  from: string;
  to: string;
  amount: number;
  status: StoredTxStatus;
  timestamp: string;
  raw?: string;
  txid?: string;
  context?: 'ble' | 'manual' | 'offline' | 'imported';
  confirmations?: number;
  statusReason?: string;
  errorMessage?: string;
  lastUpdated?: string;
  history?: StoredTxHistoryEntry[];
}

export interface StatusUpdateOptions {
  statusReason?: string;
  confirmations?: number;
  errorMessage?: string;
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
    const normalized = this.prepareForStorage(tx);
    txs.unshift(normalized);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
    this.emitChange();
  }

  update(id: string, changes: Partial<StoredTx>) {
    const txs = this.getAll();
    const idx = txs.findIndex(t => t.id === id);
    if (idx !== -1) {
      txs[idx] = this.applyChanges(txs[idx], changes);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
      this.emitChange();
    }
  }

  updateByTxid(txid: string, changes: Partial<StoredTx>) {
    const txs = this.getAll();
    const idx = txs.findIndex(t => t.txid === txid);
    if (idx !== -1) {
      txs[idx] = this.applyChanges(txs[idx], changes);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
      this.emitChange();
    }
  }

  updateStatus(id: string, newStatus: StoredTxStatus, options: StatusUpdateOptions = {}) {
    this.update(id, this.buildStatusPayload(newStatus, options));
  }

  updateStatusByTxid(txid: string, newStatus: StoredTxStatus, options: StatusUpdateOptions = {}) {
    this.updateByTxid(txid, this.buildStatusPayload(newStatus, options));
  }

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.emitChange();
  }

  private prepareForStorage(tx: StoredTx): StoredTx {
    const now = new Date().toISOString();
    const hasHistory = Array.isArray(tx.history) && tx.history.length > 0;
    const history = hasHistory
      ? tx.history
      : [
          {
            status: tx.status,
            timestamp: now,
            reason: tx.statusReason,
          },
        ];

    return {
      ...tx,
      history,
      lastUpdated: tx.lastUpdated ?? now,
    };
  }

  private applyChanges(current: StoredTx, changes: Partial<StoredTx>): StoredTx {
    const baseHistory = changes.history ?? current.history ?? [];
    const now = new Date().toISOString();
    let history = baseHistory;
    let lastUpdated = changes.lastUpdated ?? current.lastUpdated ?? current.timestamp;

    if (changes.status && changes.status !== current.status) {
      history = [
        ...baseHistory,
        {
          status: changes.status,
          timestamp: now,
          reason: changes.statusReason ?? changes.errorMessage ?? current.statusReason,
        },
      ];
      lastUpdated = now;
    } else if (
      'statusReason' in changes ||
      'confirmations' in changes ||
      'errorMessage' in changes
    ) {
      lastUpdated = now;
    }

    return {
      ...current,
      ...changes,
      history,
      lastUpdated,
    };
  }

  private buildStatusPayload(status: StoredTxStatus, options: StatusUpdateOptions): Partial<StoredTx> {
    const payload: Partial<StoredTx> = { status };

    if (options.statusReason !== undefined) {
      payload.statusReason = options.statusReason;
    }

    if (options.confirmations !== undefined) {
      payload.confirmations = options.confirmations;
    }

    if (options.errorMessage !== undefined) {
      payload.errorMessage = options.errorMessage;
    }

    return payload;
  }
}
