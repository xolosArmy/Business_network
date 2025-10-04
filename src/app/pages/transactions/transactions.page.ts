import { Component, OnInit } from '@angular/core';
import { TxStorageService, StoredTx } from '../../services/tx-storage.service';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss']
})
export class TransactionsPage implements OnInit {
  txs: StoredTx[] = [];

  constructor(private store: TxStorageService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.txs = this.store.getAll();
  }

  getColor(status: string): string {
    switch (status) {
      case 'pending': return 'warning';
      case 'signed': return 'medium';
      case 'broadcasted': return 'success';
      default: return 'dark';
    }
  }
}
