import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { Toast } from '@capacitor/toast';
import { StorageService } from './storage.service';
import { WalletService } from './wallet.service';
import { ChronikService } from './chronik.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private syncing = false;

  constructor(
    private storage: StorageService,
    private walletService: WalletService,
    private chronik: ChronikService,
  ) {
    this.listenForNetwork();
    void this.chronik.syncAll();
  }

  listenForNetwork() {
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected && !this.syncing) {
        this.syncPendingTxs();
        void this.chronik.syncAll();
      }
    });
  }

  async syncPendingTxs() {
    this.syncing = true;
    console.log('Sincronizando transacciones pendientes...');

    const txs = await this.storage.getAllTxs();
    const pendings = txs.filter((t) => t.pending);

    for (const tx of pendings) {
      try {
        const result = await this.walletService.enviar(tx.toAddress, tx.amount);
        if (result && result.txid) {
          this.storage.markAsSent(tx.txid);
          console.log(`Tx ${tx.txid} enviada correctamente.`);
          await this.showToast(`Tx ${tx.txid} enviada tras reconexión`);
        }
      } catch (e) {
        console.warn(`Error reenviando tx ${tx.txid}:`, e);
      }
    }

    this.syncing = false;
    void this.chronik.syncAll();
  }

  private async showToast(message: string) {
    await Toast.show({ text: message, duration: 'short' });
  }
}
