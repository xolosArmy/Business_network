import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';

import { BLEService } from './ble.service';

@Injectable({
  providedIn: 'root',
})
export class TxBLEService {
  private wallet: Wallet | null = null;

  constructor(private readonly ble: BLEService) {}

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
      const sats = Math.floor(amountXec * 100);
      const tx = await this.wallet.createTx({
        to,
        amount: sats,
      });

      const rawHex = tx.hex;
      console.log('🧾 TX firmada:', rawHex);

      await this.ble.sendMessage(
        JSON.stringify({
          type: 'tx',
          from: this.wallet.address(),
          to,
          amount: amountXec,
          raw: rawHex,
        }),
      );

      this.ble.notify('Transacción enviada por BLE');
      console.log('📡 TX BLE enviada:', { to, amountXec });
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
      } else {
        console.warn('🌐 Sin conexión — TX almacenada localmente');
        localStorage.setItem('pendingTx', JSON.stringify(txData));
      }
    } catch (err) {
      console.error('Error procesando TX BLE:', err);
    }
  }
}
