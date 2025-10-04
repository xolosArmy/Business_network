import { Component } from '@angular/core';
import { TxBLEService } from '../../services/tx-ble.service';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss']
})
export class WalletPage {
  toAddr = '';
  amount = '';

  constructor(private txBle: TxBLEService) {}

  async sendTxBLE() {
    await this.txBle.createAndSendTx(this.toAddr, parseFloat(this.amount));
  }
}
