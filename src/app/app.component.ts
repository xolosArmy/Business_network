import { Component, OnInit } from '@angular/core';
import { PwaService } from './services/pwa.service';
import { EnviarService } from './services/enviar.service';
import { SyncService } from './services/sync.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  constructor(
    private pwa: PwaService,
    private enviarService: EnviarService,
    private sync: SyncService,
  ) {}

  ngOnInit() {
    this.sync.listenForNetwork();
    setTimeout(() => this.pwa.showInstallPrompt(), 5000);
    void this.enviarService.processPendingTransactions();

    if ('Notification' in window) {
      Notification.requestPermission().then((result) => {
        console.log('🔔 Permiso notificaciones:', result);
      });
    }

    window.addEventListener('online', async () => {
      const pending = localStorage.getItem('pendingTx');
      if (pending) {
        const data = JSON.parse(pending);
        const res = await fetch('https://chronik.e.cash/xec-mainnet/tx', {
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
