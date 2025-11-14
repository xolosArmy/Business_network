import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  ChronikClient,
  type ScriptUtxos,
  type TxHistoryPage,
  type Utxo,
} from 'chronik-client';
import * as ecashaddr from 'ecashaddrjs';
import { Buffer } from 'buffer';

import { environment } from '../../environments/environment';

export type ChronikConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

function u8ToHex(u8: Uint8Array): string {
  return Array.from(u8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

@Injectable({ providedIn: 'root' })
type AddressBalance = {
  confirmed: number;
  unconfirmed: number;
  utxos: Utxo[];
};

type AddressUtxos = {
  utxos: Utxo[];
  raw: ScriptUtxos[];
};

export class ChronikService {
  private readonly client = new ChronikClient(environment.CHRONIK_BASE);
  private activeWs?: ReturnType<ChronikClient['ws']>;

  readonly connectionState$ = new BehaviorSubject<ChronikConnectionState>('idle');
  readonly wsConnected$ = new BehaviorSubject<boolean>(false);

  constructor(private readonly zone: NgZone) {}

  get chronikClient(): ChronikClient {
    return this.client;
  }

  private toHash160(address: string): string {
    const decoded = ecashaddr.decode(address);
    return u8ToHex(decoded.hash);
  }

  async getBalanceByAddress(address: string): Promise<AddressBalance> {
    const { utxos } = await this.getUtxosByAddress(address);
    const { confirmed, unconfirmed } = utxos.reduce(
      (acc, utxo) => {
        const value = typeof utxo.value === 'string' ? Number(utxo.value) : utxo.value ?? 0;
        if ((utxo.blockHeight ?? -1) >= 0) {
          acc.confirmed += value;
        } else {
          acc.unconfirmed += value;
        }
        return acc;
      },
      { confirmed: 0, unconfirmed: 0 },
    );
    return { confirmed, unconfirmed, utxos };
  }

  async getUtxosByAddress(address: string): Promise<AddressUtxos> {
    const h160 = this.toHash160(address);
    const scriptUtxos = await this.client.script('p2pkh', h160).utxos();
    const utxos = Array.isArray(scriptUtxos)
      ? scriptUtxos.flatMap((entry) => entry?.utxos ?? [])
      : scriptUtxos?.utxos ?? [];
    return { utxos, raw: Array.isArray(scriptUtxos) ? scriptUtxos : scriptUtxos ? [scriptUtxos] : [] };
  }

  async getHistoryByAddress(address: string, page = 0): Promise<TxHistoryPage> {
    const h160 = this.toHash160(address);
    return this.client.script('p2pkh', h160).history(page);
  }

  async broadcast(rawTxHex: string) {
    const raw = Uint8Array.from(Buffer.from(rawTxHex, 'hex'));
    return this.client.broadcastTx(raw);
  }

  async getToken(tokenId: string) {
    return this.client.token(tokenId);
  }

  wsSubscribeAddress(
    address: string,
    handlers: {
      onConnect?: (e: any) => void;
      onMessage?: (m: any) => void;
      onError?: (e: any) => void;
      onEnd?: () => void;
    },
  ) {
    const h160 = this.toHash160(address);
    this.activeWs?.close?.();

    this.zone.run(() => {
      this.connectionState$.next('connecting');
      this.wsConnected$.next(false);
    });

    const ws = this.client.ws({
      onConnect: (event: any) => {
        this.zone.run(() => {
          this.connectionState$.next('connected');
          this.wsConnected$.next(true);
        });
        handlers.onConnect?.(event);
      },
      onMessage: (message: any) => {
        handlers.onMessage?.(message);
      },
      onError: (error: any) => {
        this.zone.run(() => {
          this.connectionState$.next('disconnected');
          this.wsConnected$.next(false);
        });
        handlers.onError?.(error);
      },
      onEnd: () => {
        this.zone.run(() => {
          this.connectionState$.next('disconnected');
          this.wsConnected$.next(false);
        });
        handlers.onEnd?.();
      },
    });

    ws.subscribe('p2pkh', h160);
    this.activeWs = ws;
    return ws;
  }
}
