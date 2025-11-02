import { Component, OnInit } from '@angular/core';
import { PwaService } from './services/pwa.service';
import { EnviarService } from './services/enviar.service';
import { SyncService } from './services/sync.service';
import { ChronikService } from './services/chronik.service';
import { TxStorageService } from './services/tx-storage.service';
import { NotificationService } from './services/notification.service';
import { TokenManagerService } from './services/token-manager.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  constructor(
    private pwa: PwaService,
    private enviarService: EnviarService,
    private sync: SyncService,
    private chronik: ChronikService,
    private store: TxStorageService,
    private notify: NotificationService,
    private tokenMgr: TokenManagerService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.pwa.init();
    this.sync.listenForNetwork();
    setTimeout(() => this.pwa.showInstallPrompt(), 5000);
    void this.enviarService.processPendingTransactions();

    const txs = this.store.getAll();
    if (txs.length > 0) {
      console.log('🔄 Sincronizando TX con Chronik...');
      await this.chronik.syncAll();
      this.chronik.startAutoSync();
    }

    const walletData = localStorage.getItem('rmz_wallet');
    if (walletData) {
      const { address } = JSON.parse(walletData);
      await this.chronik.subscribeToAddress(address);
    }

    const permission = await this.notify.requestPermission();
    if (permission !== 'unsupported') {
      console.log('🔔 Permiso notificaciones:', permission);
    }

    void this.tokenMgr.warmup().catch((error) => console.warn('TokenManager warmup failed', error));

    window.addEventListener('online', async () => {
      const pending = localStorage.getItem('pendingTx');
      if (pending) {
        const data = JSON.parse(pending);
        const res = await fetch('https://chronik.e.cash/tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hex: data.raw }),
        });
        if (res.ok) {
          console.log('✅ TX enviada tras reconexión');
          localStorage.removeItem('pendingTx');
        }
      }
    });
  }
}
