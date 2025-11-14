import { Component, OnInit } from '@angular/core';
import { PwaService } from './services/pwa.service';
import { EnviarService } from './services/enviar.service';
import { SyncService } from './services/sync.service';
import { TxStorageService } from './services/tx-storage.service';
import { NotificationService } from './services/notification.service';
import { TokenManagerService } from './services/token-manager.service';
import { ChronikService } from './services/chronik.service';

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
      console.log('🔄 Transacciones pendientes en almacenamiento local.');
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
        try {
          await this.chronik.broadcast(data.raw);
          console.log('✅ TX enviada tras reconexión');
          localStorage.removeItem('pendingTx');
        } catch (error) {
          console.warn('❌ No se pudo retransmitir la TX pendiente', error);
        }
      }
    });
  }
}
