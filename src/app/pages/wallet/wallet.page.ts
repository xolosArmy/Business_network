import { Component } from '@angular/core';
import { BLEService } from '../../services/ble.service';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss']
})
export class WalletPage {
  constructor(private ble: BLEService) {}

  connectBLE() {
    this.ble.scanAndConnect();
  }

  sendBLE() {
    const msg = 'TX ' + new Date().toISOString();
    this.ble.sendMessage(msg);
  }
}
