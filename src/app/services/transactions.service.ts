import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  ChronikClient,
  type ScriptType,
  type Tx,
  type TxHistoryPage,
} from 'chronik-client';

import { CHRONIK_URL, RMZ_TOKEN_ID } from './chronik.constants';
import { TxStorageService, type StoredTx } from './tx-storage.service';
import { toChronikScript } from '../utils/chronik';

export interface TransactionEntry {
  txid: string;
  direction: 'in' | 'out';
  xecAmount: number;
  tokenAmount?: string;
  timestamp: number;
  status: 'pending' | 'confirmed';
  confirmations?: number;
  source: 'chronik' | 'local';
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly chronikClient = new ChronikClient(CHRONIK_URL);
  private readonly historySubject = new BehaviorSubject<TransactionEntry[]>([]);
  readonly transactions$ = this.historySubject.asObservable();

  private currentAddress: string | null = null;
  private rmzDecimals = 0;
  private rmzMultiplier = 1n;
  private rmzMetadataLoaded = false;
  private rmzMetadataPromise?: Promise<void>;

  constructor(private readonly txStorage: TxStorageService) {}

  async refreshHistory(address: string): Promise<void> {
    const normalized = address?.trim();
    if (!normalized) {
      this.historySubject.next([]);
      return;
    }

    this.currentAddress = normalized;
    const script = toChronikScript(normalized);
    const [chronikHistory, localHistory] = await Promise.all([
      this.fetchChronikHistory(script.type, script.payload),
      Promise.resolve(this.mapLocalHistory(this.txStorage.getAll())),
    ]);

    const merged = [...chronikHistory, ...localHistory].sort((a, b) => b.timestamp - a.timestamp);
    this.historySubject.next(merged);
  }

  private async fetchChronikHistory(scriptType: ScriptType, payload: string): Promise<TransactionEntry[]> {
    await this.ensureRmzMetadata();
    const page: TxHistoryPage = await this.chronikClient.script(scriptType, payload).history(0, 50);
    const txs = Array.isArray(page.txs) ? page.txs : [];
    const scriptHex = this.buildP2pkhScript(payload);
    return txs.map((tx) => this.mapChronikTx(tx, scriptHex));
  }

  async save(entry: { txid: string; amount: number; to: string; time: number; confirmed: boolean }): Promise<void> {
    const stored: StoredTx = {
      id: entry.txid,
      type: 'sent',
      from: 'BLE',
      to: entry.to,
      amount: -Math.abs(entry.amount),
      status: entry.confirmed ? 'confirmed' : 'pending',
      timestamp: new Date(entry.time * 1000).toISOString(),
      txid: entry.txid,
      context: 'ble',
    };
    this.txStorage.save(stored);
    if (this.currentAddress) {
      await this.refreshHistory(this.currentAddress);
    }
  }

  private mapChronikTx(tx: Tx, scriptHex: string): TransactionEntry {
    const inputsFromWallet = tx.inputs.reduce<bigint>((sum, input) => {
      if (input.outputScript?.toLowerCase() !== scriptHex) {
        return sum;
      }
      return sum + BigInt(input.value ?? '0');
    }, 0n);

    const outputsToWallet = tx.outputs.reduce<bigint>((sum, output) => {
      if (output.outputScript?.toLowerCase() !== scriptHex) {
        return sum;
      }
      return sum + BigInt(output.value ?? '0');
    }, 0n);

    const direction: 'in' | 'out' = inputsFromWallet > 0n ? 'out' : 'in';
    const netSats =
      direction === 'in' ? outputsToWallet : inputsFromWallet > outputsToWallet ? inputsFromWallet - outputsToWallet : 0n;
    const signedXec = direction === 'in' ? Number(netSats) / 100 : (Number(netSats) / 100) * -1;

    const tokenNet = this.computeTokenNet(tx, scriptHex);
    let tokenAmount: string | undefined;
    if (tokenNet !== 0n) {
      const formatted = this.formatTokenAmount(tokenNet < 0n ? -tokenNet : tokenNet);
      tokenAmount = tokenNet > 0n ? formatted : `-${formatted}`;
    }

    const timestamp = this.extractTimestamp(tx);
    const status: 'pending' | 'confirmed' = tx.block ? 'confirmed' : 'pending';
    const confirmations = tx.block ? 1 : 0;

    return {
      txid: tx.txid,
      direction: tokenAmount ? (tokenNet > 0n ? 'in' : 'out') : direction,
      xecAmount: signedXec,
      tokenAmount,
      timestamp,
      status,
      confirmations,
      source: 'chronik',
    };
  }

  private computeTokenNet(tx: Tx, scriptHex: string): bigint {
    const tokenId = tx.slpTxData?.slpMeta?.tokenId?.toLowerCase();
    if (tokenId !== RMZ_TOKEN_ID) {
      return 0n;
    }

    const outputs = tx.outputs.reduce<bigint>((sum, output) => {
      if (output.outputScript?.toLowerCase() !== scriptHex || !output.slpToken) {
        return sum;
      }
      const amount = output.slpToken.amount ?? '0';
      return sum + BigInt(amount);
    }, 0n);

    const inputs = tx.inputs.reduce<bigint>((sum, input) => {
      if (input.outputScript?.toLowerCase() !== scriptHex || !input.slpToken) {
        return sum;
      }
      const amount = input.slpToken.amount ?? '0';
      return sum + BigInt(amount);
    }, 0n);

    return outputs - inputs;
  }

  private mapLocalHistory(entries: StoredTx[]): TransactionEntry[] {
    return entries.map((entry) => {
      const direction: 'in' | 'out' = entry.amount >= 0 ? 'in' : 'out';
      const timestamp = this.normalizeDate(entry.lastUpdated ?? entry.timestamp ?? entry.id);
      return {
        txid: entry.txid ?? entry.id,
        direction,
        xecAmount: entry.amount,
        timestamp,
        status: entry.status === 'confirmed' ? 'confirmed' : 'pending',
        confirmations: entry.confirmations,
        description: entry.statusReason ?? entry.context,
        source: 'local',
      };
    });
  }

  private buildP2pkhScript(payload: string): string {
    return `76a914${payload.toLowerCase()}88ac`;
  }

  private extractTimestamp(tx: Tx): number {
    if (tx.block?.timestamp) {
      return Number(tx.block.timestamp) * 1000;
    }
    if (tx.timeFirstSeen && Number(tx.timeFirstSeen) > 0) {
      return Number(tx.timeFirstSeen) * 1000;
    }
    return Date.now();
  }

  private normalizeDate(value: string | number | undefined): number {
    if (typeof value === 'number') {
      return value;
    }
    if (!value) {
      return Date.now();
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  private async ensureRmzMetadata(): Promise<void> {
    if (this.rmzMetadataLoaded) {
      return;
    }
    if (this.rmzMetadataPromise) {
      await this.rmzMetadataPromise;
      return;
    }

    this.rmzMetadataPromise = (async () => {
      try {
        const token = await this.chronikClient.token(RMZ_TOKEN_ID);
        const decimals = token?.slpTxData?.genesisInfo?.decimals ?? 0;
        this.rmzDecimals = typeof decimals === 'number' && decimals >= 0 ? decimals : 0;
        this.rmzMultiplier = BigInt(10) ** BigInt(this.rmzDecimals);
        this.rmzMetadataLoaded = true;
      } catch (error) {
        console.warn('[TransactionsService] No se pudo obtener metadata de RMZ', error);
        this.rmzDecimals = 0;
        this.rmzMultiplier = 1n;
      } finally {
        this.rmzMetadataPromise = undefined;
      }
    })();

    await this.rmzMetadataPromise;
  }

  private formatTokenAmount(atoms: bigint): string {
    if (this.rmzDecimals <= 0) {
      return atoms.toString();
    }
    const whole = atoms / this.rmzMultiplier;
    const fraction = atoms % this.rmzMultiplier;
    if (fraction === 0n) {
      return whole.toString();
    }
    return `${whole.toString()}.${fraction.toString().padStart(this.rmzDecimals, '0').replace(/0+$/, '')}`;
  }
}
