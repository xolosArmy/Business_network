import { Component } from '@angular/core';

@Component({
  selector: 'app-tabs',
  template: `
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>

      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="wallet" [routerLink]="['/tabs/wallet']">
          <ion-label>Wallet</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="transactions" [routerLink]="['/tabs/transactions']">
          <ion-label>Transacciones</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="settings" [routerLink]="['/tabs/settings']">
          <ion-label>Configuración</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {}
