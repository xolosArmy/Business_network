import { Component, OnInit } from '@angular/core';

import {
  OfflineStorageService,
  StoredTransaction,
  TransactionStatus,
} from '../../services/offline-storage.service';

@Component({
  selector: 'app-transactions',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Transacciones</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list>
        <ion-item *ngFor="let item of transactions">
          <ion-label>
            <h2>{{ item.description }}</h2>
            <p>{{ item.date | date: 'medium' }}</p>
            <ion-chip *ngIf="item.status" [color]="getStatusColor(item.status)">
              {{ statusLabels[item.status] }}
            </ion-chip>
            <p *ngIf="item.txid">ID: {{ item.txid }}</p>
            <p *ngIf="item.errorMessage" class="error-text">Error: {{ item.errorMessage }}</p>
          </ion-label>
          <ion-note
            slot="end"
            [color]="item.amount >= 0 ? 'success' : 'danger'"
          >
            {{ item.amount | number: '1.2-2' }} XEC
          </ion-note>
        </ion-item>
      </ion-list>

      <ion-item *ngIf="transactions.length === 0" lines="none">
        <ion-label>No hay transacciones todavía.</ion-label>
      </ion-item>
    </ion-content>
  `,
  styles: [
    `
      .error-text {
        color: var(--ion-color-danger);
        margin-top: 4px;
      }
    `,
  ],
})
export class TransactionsPage implements OnInit {
  transactions: StoredTransaction[] = [];

  readonly statusLabels: Record<TransactionStatus, string> = {
    confirmed: 'Confirmada',
    pending: 'Pendiente',
    failed: 'Fallida',
  };

  constructor(private readonly offlineStorage: OfflineStorageService) {}

  async ngOnInit(): Promise<void> {
    await this.loadTransactions();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadTransactions();
  }

  getStatusColor(status?: TransactionStatus): string {
    if (status === 'confirmed') {
      return 'success';
    }
    if (status === 'pending') {
      return 'warning';
    }
    if (status === 'failed') {
      return 'danger';
    }
    return 'medium';
  }

  private async loadTransactions(): Promise<void> {
    const stored = await this.offlineStorage.getTransactions();
    if (stored.length > 0) {
      this.transactions = stored;
      return;
    }

    const defaults: StoredTransaction[] = [
      {
        id: 1,
        description: 'Pago recibido',
        amount: 1250.5,
        date: new Date('2024-10-01').toISOString(),
        status: 'confirmed',
      },
      {
        id: 2,
        description: 'Compra en tienda',
        amount: -230.75,
        date: new Date('2024-09-26').toISOString(),
        status: 'confirmed',
      },
      {
        id: 3,
        description: 'Retiro en cajero',
        amount: -500,
        date: new Date('2024-09-20').toISOString(),
        status: 'confirmed',
      },
    ];

    await this.offlineStorage.saveTransactions(defaults);
    this.transactions = await this.offlineStorage.getTransactions();
  }
}
