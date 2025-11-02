// src/app/pages/wallet/wallet.page.ts
import { Component } from '@angular/core';
import { CarteraService } from '../../services/cartera.service';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
})
export class WalletPage {
  constructor(public cartera: CarteraService) {}
  onCrear() { this.cartera.crearNuevaCartera().catch(console.error); }
}
