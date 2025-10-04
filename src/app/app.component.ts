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
  }
}
