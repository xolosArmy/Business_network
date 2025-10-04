import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private key = 'rmz_transactions';
  private chronikUrl = 'https://chronik.e.cash/xec-mainnet';

  constructor(private http: HttpClient) {}

  async save(tx: any) {
    const list = await this.getAll();
    list.unshift(tx);
    await Preferences.set({ key: this.key, value: JSON.stringify(list.slice(0, 100)) });
  }

  async getAll(): Promise<any[]> {
    const stored = await Preferences.get({ key: this.key });
    return stored.value ? JSON.parse(stored.value) : [];
  }

  async sync(address: string) {
    try {
      const result: any = await this.http
        .get(`${this.chronikUrl}/script/${address}/history`)
        .toPromise();
      const txs =
        result?.txs?.map((t: any) => ({
          txid: t.txid,
          amount: t.value ?? 0,
          time: t.time_first_seen,
          confirmed: t.block?.height ? true : false,
        })) ?? [];
      await Preferences.set({ key: this.key, value: JSON.stringify(txs) });
      return txs;
    } catch (err) {
      console.warn('sync error', err);
      return [];
    }
  }

  async clear() {
    await Preferences.remove({ key: this.key });
  }
}
