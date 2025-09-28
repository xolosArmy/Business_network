import { Component } from '@angular/core';

interface TransactionItem {
  id: number;
  description: string;
  amount: number;
  date: string;
}

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
            <p>{{ item.date }}</p>
          </ion-label>
          <ion-note slot="end" color="primary">{{ item.amount | number: '1.2-2' }} XEC</ion-note>
        </ion-item>
      </ion-list>

      <ion-item *ngIf="transactions.length === 0" lines="none">
        <ion-label>No hay transacciones todavía.</ion-label>
      </ion-item>
    </ion-content>
  `,
})
export class TransactionsPage {
  readonly transactions: TransactionItem[] = [
    { id: 1, description: 'Pago recibido', amount: 1250.5, date: '2024-10-01' },
    { id: 2, description: 'Compra en tienda', amount: -230.75, date: '2024-09-26' },
    { id: 3, description: 'Retiro en cajero', amount: -500.0, date: '2024-09-20' },
  ];
}
