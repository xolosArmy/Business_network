import { Component, OnInit, OnDestroy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { TxStorageService, StoredTx } from '../../services/tx-storage.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('400ms ease-out', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class TransactionsPage implements OnInit, OnDestroy {
  txs: StoredTx[] = [];
  sub?: Subscription;

  constructor(private store: TxStorageService) {}

  ngOnInit(): void {
    this.sub = this.store.tx$.subscribe((data: StoredTx[]) => {
      this.txs = data;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  getColor(status: string): string {
    switch (status) {
      case 'pending': return 'warning';
      case 'signed': return 'medium';
      case 'broadcasted': return 'success';
      case 'confirmed': return 'tertiary';
      default: return 'dark';
    }
  }

  clearAll(): void {
    this.store.clear();
  }
}
