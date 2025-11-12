import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { CHRONIK } from '../../environments/chronik.config';

type AddressUtxo = {
  outpoint: { txid: string; outIdx: number };
  value: number; // sats
  token?: { tokenId: string; amount: string };
};

@Injectable({ providedIn: 'root' })
export class ChronikService {
  private restBase = CHRONIK.REST_BASES[0];
  private ws?: WebSocket;

  public wsConnected$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient, private zone: NgZone) {}

  /** Fallback circular a siguientes bases si falla la actual */
  private rotateRestBase() {
    const idx = CHRONIK.REST_BASES.indexOf(this.restBase);
    this.restBase = CHRONIK.REST_BASES[(idx + 1) % CHRONIK.REST_BASES.length];
  }

  async getAddressUtxos(address: string): Promise<AddressUtxo[]> {
    for (let i = 0; i < CHRONIK.REST_BASES.length; i++) {
      try {
        const url = `${this.restBase}/address/${address}/utxos`;
        const res = await firstValueFrom(this.http.get<{utxos: AddressUtxo[]}>(url));
        return res.utxos || [];
      } catch {
        this.rotateRestBase();
      }
    }
    return [];
  }

  async getTokenInfo(tokenId: string) {
    for (let i = 0; i < CHRONIK.REST_BASES.length; i++) {
      try {
        const url = `${this.restBase}/token/${tokenId}`;
        return await firstValueFrom(this.http.get(url));
      } catch {
        this.rotateRestBase();
      }
    }
    return null;
  }

  /** WS opcional: no rompe la app si no conecta */
  connectWS(addressesToWatch: string[] = []) {
    let connected = false;
    for (const base of CHRONIK.WS_BASES) {
      try {
        const ws = new WebSocket(base);
        this.ws = ws;

        ws.onopen = () => {
          connected = true;
          this.zone.run(() => this.wsConnected$.next(true));
          // Suscribir a direcciones (REST usa address text)
          for (const addr of addressesToWatch) {
            ws.send(JSON.stringify({ type: 'subscribe', script: `address:${addr}` }));
          }
        };
        ws.onclose = () => this.zone.run(() => this.wsConnected$.next(false));
        ws.onerror  = () => {/* silencioso, usamos REST de todos modos */};
        break;
      } catch {
        // intenta siguiente base
      }
    }
    if (!connected) this.zone.run(() => this.wsConnected$.next(false));
  }
}
