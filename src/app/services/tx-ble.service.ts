import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';

import { BLEService } from './ble.service';
import { StoredTx, TxStorageService } from './tx-storage.service';

@Injectable({
  providedIn: 'root',
})
export class TxBLEService {
  private wallet: Wallet | null = null;

  constructor(
    private readonly ble: BLEService,
    private readonly store: TxStorageService,
  ) {}

  private generateId(): string {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi?.randomUUID) {
      return cryptoApi.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  async initWallet(mnemonic: string): Promise<void> {
    this.wallet = await Wallet.fromMnemonic(mnemonic);
    console.log('✅ Cartera inicializada:', this.wallet.address());
  }

  async createAndSendTx(to: string, amountXec: number): Promise<void> {
    if (!this.wallet) {
      console.error('❌ No hay cartera cargada');
      return;
    }

    try {
      const txId = this.generateId();
      const fromAddress = this.wallet.address();
      const timestamp = new Date().toISOString();

      const sats = Math.floor(amountXec * 100);
      const tx = await this.wallet.createTx({
        to,
        amount: sats,
      });

      const rawHex = tx.hex;
      console.log('🧾 TX firmada:', rawHex);

      const storedTx: StoredTx = {
        id: txId,
        type: 'sent',
        from: fromAddress,
        to,
        amount: amountXec,
        status: 'signed',
        timestamp,
        raw: rawHex,
      };

      this.store.save(storedTx);

      await this.ble.sendMessage(
        JSON.stringify({
          type: 'tx',
          id: txId,
          from: fromAddress,
          to,
          amount: amountXec,
          raw: rawHex,
        }),
      );

      this.ble.notify('Transacción enviada por BLE');
      console.log('📡 TX BLE enviada:', { to, amountXec });

      this.store.updateStatus(txId, 'broadcasted');
    } catch (error) {
      console.error('❌ Error al crear/enviar TX:', error);
      this.ble.notify('Error al enviar TX por BLE');
    }
  }

  async receiveAndBroadcast(data: unknown): Promise<void> {
    try {
      const txData = JSON.parse(String(data));
      if (txData.type !== 'tx') {
        return;
      }

      const id = Date.now().toString();
      this.store.save({
        id,
        type: 'received',
        from: txData.from,
        to: txData.to,
        amount: txData.amount,
        status: navigator.onLine ? 'broadcasted' : 'pending',
        timestamp: new Date().toISOString(),
        raw: txData.raw,
      });

      console.log('📥 TX recibida por BLE:', txData);

      if (navigator.onLine) {
        const response = await fetch('https://chronik.e.cash/xec-mainnet/tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hex: txData.raw }),
        });

        const result = await response.json();
        console.log('✅ TX transmitida a red:', result);
        this.ble.notify('TX retransmitida a la red eCash');
        this.store.updateStatus(id, 'broadcasted');
      } else {
        console.warn('🌐 Sin conexión — TX almacenada localmente');
        this.ble.notify('TX recibida y pendiente de retransmitir');
      }
    } catch (err) {
      console.error('Error procesando TX BLE:', err);
    }
  }
}
