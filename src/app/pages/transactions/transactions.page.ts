import { Component, OnInit } from '@angular/core';
import { TransactionsService } from '../../services/transactions.service';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss'],
})
export class TransactionsPage implements OnInit {
  txs: any[] = [];
  loading = false;

  constructor(private txService: TransactionsService, private wallet: WalletService) {}

  async ngOnInit() {
    this.txs = await this.txService.getAll();
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
}
