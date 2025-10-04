import { Component, OnInit, OnDestroy } from '@angular/core';
import { TxStorageService, StoredTx } from '../../services/tx-storage.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss']
})
export class TransactionsPage implements OnInit, OnDestroy {
  txs: StoredTx[] = [];
  sub?: Subscription;

  constructor(private store: TxStorageService) {}

  ngOnInit() {
    this.sub = this.store.tx$.subscribe(data => {
      this.txs = data;
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  getColor(status: string): string {
    switch (status) {
      case 'pending': return 'warning';
      case 'signed': return 'medium';
      case 'broadcasted': return 'success';
      default: return 'dark';
    }
  }

  clearAll() {
    this.store.clear();
  }
}
