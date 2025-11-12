import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';
import { ChronikClient, type ScriptType, type SubscribeMsg } from 'chronik-client';

import { OfflineStorageService } from './offline-storage.service';
import { CHRONIK_URL } from './chronik.constants';
import { toChronikScript } from '../utils/chronik';
import { WalletService } from './wallet.service';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'disconnected';
type SyncHandler = (msg: SubscribeMsg) => void;

interface WatchedScript {
  scriptType: ScriptType;
  payload: string;
  handlers: Set<SyncHandler>;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly statusSubject = new BehaviorSubject<SyncStatus>('idle');
  readonly status$ = this.statusSubject.asObservable();

  private readonly chronikClient = new ChronikClient(CHRONIK_URL);
  private wsClient?: ReturnType<ChronikClient['ws']>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly watchedScripts = new Map<string, WatchedScript>();
  private syncingPending = false;

  constructor(
    private readonly offlineStorage: OfflineStorageService,
    private readonly walletService: WalletService,
  ) {}

  listenForNetwork(): void {
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        void this.syncPendingTxs();
        if (this.watchedScripts.size > 0) {
          void this.ensureWebSocket();
        }
      } else {
        this.statusSubject.next('disconnected');
      }
    });
  }

  async syncPendingTxs(): Promise<void> {
    if (this.syncingPending) {
      return;
    }

    this.syncingPending = true;

    try {
      const wallet = await this.offlineStorage.getWallet();
      const mnemonic = wallet?.mnemonic?.trim();
      const address = wallet?.address?.trim();
      if (!mnemonic || !address) {
        return;
      }

      const pending = await this.offlineStorage.getPendingTransactions();
      if (!pending.length) {
        return;
      }

      await this.ensureWalletInitialized(mnemonic);

      for (const transaction of pending) {
        if (!transaction.id || transaction.txid) {
          continue;
        }

        const destination = (transaction.destination ?? transaction.payload?.destination)?.trim();
        const amountSource = Number.isFinite(transaction.payload?.amount)
          ? transaction.payload?.amount
          : transaction.amount;
        const amount = typeof amountSource === 'number' ? Math.abs(amountSource) : NaN;

        if (!destination || !Number.isFinite(amount) || amount <= 0) {
          await this.offlineStorage.updateTransaction(transaction.id, {
            status: 'failed',
            errorMessage: 'Información incompleta para reenviar la transacción.',
          });
          continue;
        }

        try {
          const txid = await this.walletService.sendXec(destination, amount);
          await this.offlineStorage.updateTransaction(transaction.id, {
            status: 'confirmed',
            txid,
            date: new Date().toISOString(),
            payload: undefined,
            errorMessage: undefined,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.offlineStorage.updateTransaction(transaction.id, {
            status: 'failed',
            errorMessage: message,
          });
        }
      }
    } finally {
      this.syncingPending = false;
    }
  }

  private async ensureWalletInitialized(mnemonic: string): Promise<void> {
    const normalizedMnemonic = mnemonic?.trim();
    if (!normalizedMnemonic) {
      return;
    }
    const current = this.walletService.mnemonic?.trim();
    if (current && current === normalizedMnemonic) {
      return;
    }
    await this.walletService.initWallet(normalizedMnemonic);
  }

  async watchAddress(address: string, handler: SyncHandler): Promise<void> {
    const normalized = address.trim().toLowerCase();
    let record = this.watchedScripts.get(normalized);
    if (!record) {
      const script = toChronikScript(address);
      record = {
        scriptType: script.type,
        payload: script.payload,
        handlers: new Set<SyncHandler>(),
      };
      this.watchedScripts.set(normalized, record);
    }
    record.handlers.add(handler);
    await this.ensureWebSocket();
    this.wsClient?.subscribe(record.scriptType, record.payload);
  }

  private async ensureWebSocket(): Promise<void> {
    if (this.wsClient || this.watchedScripts.size === 0) {
      return;
    }

    this.statusSubject.next('syncing');

    const handleDisconnect = () => {
      this.statusSubject.next('disconnected');
      this.wsClient = undefined;
      this.scheduleReconnect();
    };

    const ws = this.chronikClient.ws({
      autoReconnect: true,
      onMessage: (msg) => this.dispatchMessage(msg as SubscribeMsg),
      onConnect: () => {
        this.statusSubject.next('synced');
        void this.resubscribeAll();
      },
      onReconnect: () => {
        this.statusSubject.next('syncing');
      },
      onError: (error) => {
        console.warn('[SyncService] Error en Chronik WS', error);
        this.statusSubject.next('disconnected');
      },
      onEnd: handleDisconnect,
      onClose: handleDisconnect,
    });

    this.wsClient = ws;
    await ws.waitForOpen();
  }

  private dispatchMessage(msg: SubscribeMsg): void {
    this.watchedScripts.forEach((record) => {
      record.handlers.forEach((handler) => {
        try {
          handler(msg);
        } catch (error) {
          console.warn('[SyncService] Handler WS lanzó error', error);
        }
      });
    });
  }

  private async resubscribeAll(): Promise<void> {
    if (!this.wsClient) {
      return;
    }
    for (const record of this.watchedScripts.values()) {
      try {
        this.wsClient.subscribe(record.scriptType, record.payload);
      } catch (error) {
        console.warn('[SyncService] No se pudo resuscribir a Chronik', error);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.watchedScripts.size === 0) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.ensureWebSocket();
    }, 3000);
  }

}
