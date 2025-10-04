import { Component, OnInit } from '@angular/core';
import { TransactionsService } from '../../services/transactions.service';
import { WalletService } from '../../services/wallet.service';
import { StoredTx, TxStorageService } from '../../services/tx-storage.service';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss'],
})
export class TransactionsPage implements OnInit {
  txs: any[] = [];
  bleTxs: StoredTx[] = [];
  loading = false;

  constructor(
    private txService: TransactionsService,
    private wallet: WalletService,
    private readonly txStorage: TxStorageService,
  ) {}

  async ngOnInit() {
    this.txs = await this.txService.getAll();
    this.loadBleTxs();
  }

  ionViewWillEnter() {
    this.loadBleTxs();
  }

  async syncNow() {
    this.loading = true;
    const addr = this.wallet?.address;
    if (addr) this.txs = await this.txService.sync(addr);
    this.loading = false;
  }

  async clear() {
    await this.txService.clear();
    this.txs = [];
  }

  clearBleHistory() {
    this.txStorage.clear();
    this.loadBleTxs();
  }

  statusLabel(status: StoredTx['status']): string {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'signed':
        return 'Firmada';
      case 'broadcasted':
        return 'Retransmitida';
      default:
        return status;
    }
  }

  statusColor(status: StoredTx['status']): string {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'signed':
        return 'medium';
      case 'broadcasted':
        return 'success';
      default:
        return 'medium';
    }
  }

  txTypeIcon(type: StoredTx['type']): string {
    return type === 'sent' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline';
  }

  txTypeLabel(type: StoredTx['type']): string {
    return type === 'sent' ? 'Enviada' : 'Recibida';
  }

  private loadBleTxs() {
    this.bleTxs = this.txStorage.getAll();
  }
}
