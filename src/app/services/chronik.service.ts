import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Subject } from 'rxjs';

import { addressToHash160 } from '../utils/address';

import { TxStorageService, type StoredTxStatus } from './tx-storage.service';
import { NotificationService } from './notification.service';
import { NotificationSettingsService } from './notification-settings.service';
import { RMZ_TOKEN_ID } from './chronik.constants';

type ChronikWsClient = ReturnType<ChronikClient['ws']>;

type ChronikWsMessage = {
  type?: string;
  txid?: string;
  tx?: { txid?: string };
};

@Injectable({
  providedIn: 'root',
})
export class ChronikService {
  private readonly chronik = new ChronikClient('https://chronik.e.cash');
  private readonly subscribedAddresses = new Set<string>();
  private readonly scriptToAddress = new Map<string, string>();
  private readonly tokenStatusByTxid = new Map<string, StoredTxStatus>();
  private wsClient?: ChronikWsClient;
  private wsReady!: Promise<void>;
  private resolveWsReady?: () => void;
  private readonly tokenEventsSubject = new Subject<TokenEvent>();

  constructor(
    private readonly store: TxStorageService,
    private readonly notify: NotificationService,
    private readonly settingsService: NotificationSettingsService,
  ) {
    this.ensureWsClient();
  }

  readonly tokenEvents$ = this.tokenEventsSubject.asObservable();

  async checkTxStatus(txid: string | undefined | null): Promise<void> {
    if (!txid) {
      return;
    }

    try {
      const res = await this.chronik.tx(txid);
      if (res && res.block) {
        console.log('✅ TX confirmada:', txid);
        this.store.updateStatusByTxid(txid, 'confirmed');
      } else {
        console.log('⏳ TX aún no confirmada:', txid);
        this.store.updateStatusByTxid(txid, 'broadcasted');
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        console.log('🚫 TX aún no propagada:', txid);
      } else {
        console.error('Error verificando TX:', err);
      }
    }
  }

  async subscribeToAddress(address: string | undefined | null): Promise<void> {
    if (!address || this.subscribedAddresses.has(address)) {
      return;
    }

    this.subscribedAddresses.add(address);

    try {
      await this.ensureWsClient();
      await this.wsReady;
      const h160 = addressToHash160(address);
      const scriptHex = this.buildP2pkhScript(h160);
      this.scriptToAddress.set(scriptHex, address);
      await this.subscribeToChronikScript('p2pkh', h160);
    } catch (err) {
      console.error('❌ Error Chronik WS:', err);
    }
  }

  async syncAll(): Promise<void> {
    const txs = this.store.getAll();
    for (const tx of txs) {
      if (tx.txid && tx.status !== 'confirmed') {
        await this.checkTxStatus(tx.txid);
      }
    }
  }

  startAutoSync(intervalMs = 60000): void {
    setInterval(() => this.syncAll(), intervalMs);
  }

  private ensureWsClient(): ChronikWsClient {
    if (!this.wsClient) {
      this.prepareWsReady();
      this.wsClient = this.chronik.ws({
        onMessage: msg => this.handleWsMessage(msg),
        onReconnect: e => {
          console.warn('🔁 Reconexion Chronik', e);
          this.prepareWsReady();
        },
      });

      this.wsClient.onConnect = () => {
        void (async () => {
          console.log('🛰️ Conectado a Chronik WS');
          this.resolveWsReady?.();
          this.resolveWsReady = undefined;

          for (const address of this.subscribedAddresses) {
            try {
              const h160 = addressToHash160(address);
              const scriptHex = this.buildP2pkhScript(h160);
              this.scriptToAddress.set(scriptHex, address);
              await this.subscribeToChronikScript('p2pkh', h160);
            } catch (err) {
              console.error('❌ Error suscribiendo dirección Chronik:', err);
            }
          }
        })();
      };
    }

    return this.wsClient;
  }

  private async subscribeToChronikScript(scriptType: string, script: string): Promise<void> {
    if (!this.wsClient) {
      return;
    }

    const client = this.wsClient as unknown as {
      subscribe?: (type: string, id: string) => Promise<void>;
      subscribeToScript?: (type: string, id: string) => Promise<void>;
    };

    if (client.subscribe) {
      await client.subscribe(scriptType, script);
      return;
    }

    if (client.subscribeToScript) {
      await client.subscribeToScript(scriptType, script);
      return;
    }

    console.error('❌ Chronik WS client no soporta métodos de suscripción conocidos');
  }

  private prepareWsReady(): void {
    this.wsReady = new Promise(resolve => {
      this.resolveWsReady = resolve;
    });
  }

  private handleWsMessage(msg: ChronikWsMessage): void {
    if (!msg?.type) {
      return;
    }

    const txid = msg.txid || msg.tx?.txid;
    if (!txid) {
      return;
    }

    console.log('📦 TX actualizada vía WS:', txid, msg.type);

    const settings = this.settingsService.getSettings();

    if (msg.type === 'AddedToMempool' && settings.network) {
      void this.notify.toast(`📥 TX recibida: ${txid}`);
      this.notify.show('💸 Nueva TX detectada', 'Se ha recibido una transacción pendiente');
      this.store.updateStatusByTxid(txid, 'broadcasted');
    }

    if (msg.type === 'Confirmed' && settings.network) {
      void this.notify.toast(`✅ TX confirmada: ${txid}`, 'success');
      this.notify.show('✅ Transacción confirmada', 'Una transacción ha sido incluida en bloque');
      this.store.updateStatusByTxid(txid, 'confirmed');
    }

    void this.detectTokenActivity(txid, msg.type);
  }

  private buildP2pkhScript(hash160: string): string {
    return `76a914${hash160}88ac`.toLowerCase();
  }

  private async detectTokenActivity(txid: string, msgType: string): Promise<void> {
    const normalizedStatus = this.normalizeStatus(msgType);
    if (!normalizedStatus) {
      return;
    }

    try {
      const tx = await this.chronik.tx(txid);
      const outputs = Array.isArray((tx as any)?.outputs) ? (tx as any).outputs : [];
      const timestamp = new Date().toISOString();

      for (const output of outputs) {
        const scriptHex = String((output as any)?.outputScript ?? '').toLowerCase();
        const address = this.scriptToAddress.get(scriptHex);
        if (!address) {
          continue;
        }

        const tokenInfo = this.extractTokenInfo(output);
        if (!tokenInfo || tokenInfo.tokenId !== RMZ_TOKEN_ID) {
          continue;
        }

        const previousStatus = this.tokenStatusByTxid.get(txid);
        if (previousStatus === normalizedStatus) {
          continue;
        }

        this.tokenStatusByTxid.set(txid, normalizedStatus);
        this.persistTokenTransaction({
          txid,
          address,
          amount: tokenInfo.amount,
          status: normalizedStatus,
          timestamp,
        });
        this.emitTokenNotification(tokenInfo.amount, normalizedStatus);
        this.tokenEventsSubject.next({
          txid,
          address,
          amount: tokenInfo.amount,
          status: normalizedStatus,
          timestamp,
        });
      }
    } catch (error) {
      console.warn('No se pudo verificar la actividad de tokens RMZ para la TX', txid, error);
    }
  }

  private normalizeStatus(msgType: string): StoredTxStatus | null {
    if (msgType === 'Confirmed') {
      return 'confirmed';
    }

    if (msgType === 'AddedToMempool') {
      return 'broadcasted';
    }

    return null;
  }

  private extractTokenInfo(output: any): TokenInfo | null {
    const record = output ?? {};
    const rawToken = record.token ?? record.slpToken ?? null;
    if (!rawToken) {
      return null;
    }

    const rawTokenId = rawToken.tokenId ?? rawToken.token_id ?? rawToken.id;
    if (typeof rawTokenId !== 'string' || !rawTokenId) {
      return null;
    }

    const amount = this.normalizeTokenAmount(rawToken.amount ?? rawToken.value ?? rawToken.quantity);
    return {
      tokenId: rawTokenId.toLowerCase(),
      amount,
    };
  }

  private normalizeTokenAmount(rawAmount: unknown): number {
    if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
      return rawAmount;
    }

    if (typeof rawAmount === 'string' && rawAmount.trim()) {
      const num = Number(rawAmount);
      if (Number.isFinite(num)) {
        return num;
      }

      try {
        const big = BigInt(rawAmount);
        const converted = Number(big);
        return Number.isFinite(converted) ? converted : 0;
      } catch {
        return 0;
      }
    }

    if (typeof rawAmount === 'bigint') {
      const converted = Number(rawAmount);
      return Number.isFinite(converted) ? converted : 0;
    }

    return 0;
  }

  private persistTokenTransaction(event: TokenEvent): void {
    const existing = this.store.getAll().find((entry) => entry.txid === event.txid);
    if (!existing) {
      this.store.save({
        id: `rmz-token-${event.txid}`,
        type: 'received',
        from: 'Desconocido',
        to: event.address,
        amount: event.amount,
        status: event.status,
        timestamp: event.timestamp,
        txid: event.txid,
        context: 'manual',
        statusReason: 'RMZ token detectado automáticamente',
      });
      return;
    }

    this.store.updateByTxid(event.txid, {
      status: event.status,
      amount: event.amount,
      lastUpdated: event.timestamp,
      statusReason: 'RMZ token actualizado automáticamente',
    });
  }

  private emitTokenNotification(amount: number, status: StoredTxStatus): void {
    const settings = this.settingsService.getSettings();
    if (!settings.network) {
      return;
    }

    const formattedAmount = Number.isFinite(amount) ? amount.toString() : 'un monto';
    if (status === 'confirmed') {
      this.notify.show('✅ RMZ confirmado', `Se confirmó un recibo de ${formattedAmount} RMZ en tu dirección.`);
      return;
    }

    this.notify.show('💸 RMZ recibido', `Has recibido ${formattedAmount} RMZ (pendiente de confirmación).`);
  }
}

interface TokenInfo {
  readonly tokenId: string;
  readonly amount: number;
}

export interface TokenEvent {
  readonly txid: string;
  readonly address: string;
  readonly amount: number;
  readonly status: StoredTxStatus;
  readonly timestamp: string;
}
