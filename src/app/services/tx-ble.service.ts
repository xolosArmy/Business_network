import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';

import { BLEService } from './ble.service';
import { ChronikService } from './chronik.service';
import { NotificationService } from './notification.service';
import { NotificationSettingsService } from './notification-settings.service';
import { StoredTx, TxStorageService } from './tx-storage.service';

@Injectable({
  providedIn: 'root',
})
export class TxBLEService {
  private wallet: Wallet | null = null;

  constructor(
    private readonly ble: BLEService,
    private readonly store: TxStorageService,
    private readonly chronik: ChronikService,
    private readonly notify: NotificationService,
    private readonly settingsService: NotificationSettingsService,
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
    const address = this.wallet.address();
    console.log('✅ Cartera inicializada:', address);
    void this.chronik.subscribeToAddress(address);
    void this.chronik.syncAll();
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

      const txid = await this.computeTxid(rawHex);

      const storedTx: StoredTx = {
        id: txId,
        type: 'sent',
        from: fromAddress,
        to,
        amount: amountXec,
        status: 'signed',
        timestamp,
        raw: rawHex,
        txid: txid ?? undefined,
        context: 'ble',
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
      if (txid) {
        void this.chronik.checkTxStatus(txid);
      }
    } catch (error) {
      console.error('❌ Error al crear/enviar TX:', error);
      this.ble.notify('Error al enviar TX por BLE');
    }
  }

  async receiveAndBroadcast(data: unknown): Promise<void> {
    try {
      const txData = JSON.parse(String(data));
      const settings = this.settingsService.getSettings();
      if (txData.type !== 'tx' || !settings.ble) {
        return;
      }

      const id = Date.now().toString();
      const computedTxid = await this.computeTxid(txData.raw);
      this.store.save({
        id,
        type: 'received',
        from: txData.from,
        to: txData.to,
        amount: txData.amount,
        status: navigator.onLine ? 'broadcasted' : 'pending',
        timestamp: new Date().toISOString(),
        raw: txData.raw,
        txid: computedTxid ?? undefined,
        context: 'ble',
      });

      this.notify.show(
        '📡 TX recibida por BLE',
        `${txData.amount} XEC de ${String(txData.from).slice(0, 8)}...`,
      );

      console.log('📥 TX recibida por BLE:', txData);

      if (navigator.onLine) {
        const response = await fetch('https://chronik.e.cash/xec-mainnet/tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hex: txData.raw }),
        });

        if (!response.ok) {
          console.error('❌ Error al retransmitir TX a la red:', await response.text());
          this.store.updateStatus(id, 'failed');
          this.ble.notify('Error al retransmitir TX a la red eCash');
          return;
        }

        const result = await response.json();
        console.log('✅ TX transmitida a red:', result);
        this.ble.notify('TX retransmitida a la red eCash');
        const broadcastedTxid = result?.txid ?? computedTxid;
        if (broadcastedTxid) {
          this.store.update(id, {
            status: 'broadcasted',
            txid: broadcastedTxid,
          });
          void this.chronik.checkTxStatus(broadcastedTxid);
        } else {
          this.store.updateStatus(id, 'broadcasted');
        }
      } else {
        console.warn('🌐 Sin conexión — TX almacenada localmente');
        this.ble.notify('TX recibida y pendiente de retransmitir');
      }
    } catch (err) {
      console.error('Error procesando TX BLE:', err);
    }
  }

  private async computeTxid(rawHex: string): Promise<string | null> {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (!cryptoApi?.subtle) {
      return null;
    }

    try {
      const bytes = this.hexToBytes(rawHex);
      const firstHash = await cryptoApi.subtle.digest('SHA-256', bytes);
      const secondHash = await cryptoApi.subtle.digest('SHA-256', new Uint8Array(firstHash));
      const hashArray = Array.from(new Uint8Array(secondHash)).reverse();
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('No se pudo calcular el TXID:', error);
      return null;
    }
  }

  private hexToBytes(hex: string): Uint8Array {
    const normalized = hex.trim();
    if (normalized.length % 2 !== 0) {
      throw new Error('Hex inválido: longitud impar.');
    }

    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
      const byte = parseInt(normalized.substring(i, i + 2), 16);
      if (Number.isNaN(byte)) {
        throw new Error('Hex inválido: contiene caracteres no hexadecimales.');
      }
      bytes[i / 2] = byte;
    }
    return bytes;
  }
}
