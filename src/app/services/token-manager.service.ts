import { Buffer } from 'buffer';
import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import type { Utxo } from 'chronik-client';
import { HybridTokenManager, KeyDerivation } from 'minimal-xec-wallet';
import type { AdapterRouter } from 'src/types/minimal-xec-wallet';
import * as ecashaddr from 'ecashaddrjs';

import {
  CHRONIK_FALLBACK_URLS,
  CHRONIK_URL,
  RMZ_TOKEN_ID,
} from './chronik.constants';

const DEFAULT_HD_PATH = "m/44'/899'/0'/0/0";
const DEFAULT_FEE_RATE = 1.2;

interface HybridTokenBalance {
  readonly tokenId: string;
  readonly protocol: string;
  readonly ticker: string;
  readonly name: string;
  readonly decimals: number;
  readonly balance: {
    readonly display: number;
    readonly atoms: bigint;
  };
  readonly utxoCount: number;
  readonly [key: string]: unknown;
}

export interface SendRmzTokenOptions {
  readonly mnemonic: string;
  readonly hdPath?: string;
  readonly feeRate?: number;
  readonly address?: string;
  readonly privateKey?: string;
  readonly publicKey?: string;
}

export interface SendRmzTokenResult {
  readonly txid: string;
  readonly hex: string;
}

export type TokenBalance = HybridTokenBalance;

export interface SendRmzHybridWalletInfo {
  readonly mnemonic?: string;
  readonly hdPath?: string;
  readonly feeRate?: number;
  readonly address?: string;
  readonly xecAddress?: string;
  readonly privateKey?: string;
  readonly publicKey?: string;
}

@Injectable({ providedIn: 'root' })
export class TokenManagerService {
  private readonly chronikClient = new ChronikClient(CHRONIK_URL);
  private readonly adapterRouter: AdapterRouter;
  private readonly keyDerivation = new KeyDerivation();

  constructor() {
    const chronik = this.chronikClient;

    const adapter: AdapterRouter = {
      sendTx: async (hex: string) => {
        const res = await chronik.broadcastTx(hex);
        return typeof res === 'string' ? res : (res?.txid ?? '');
      },

      getUtxos: async (address: string | string[]): Promise<unknown> => this.fetchUtxos(address),
    };

    this.adapterRouter = adapter;
  }

  get chronik(): ChronikClient {
    return this.chronikClient;
  }

  async getTokenBalance(tokenId: string, address: string): Promise<TokenBalance> {
    const utxoData = await this.adapterRouter.getUtxos(address);
    const utxos = this.normalizeUtxos(utxoData);
    return this.createHybridTokenManager().getTokenBalance(tokenId, utxos);
  }

  async listTokens(address: string): Promise<TokenBalance[]> {
    const utxoData = await this.adapterRouter.getUtxos(address);
    const utxos = this.normalizeUtxos(utxoData);
    return this.createHybridTokenManager().listTokensFromUtxos(utxos);
  }

  async sendRmzToken(
    destAddress: string,
    amountHuman: number,
    walletInfo: SendRmzHybridWalletInfo,
  ): Promise<string> {
    const { txid } = await this.performRmzTokenSend(destAddress, amountHuman, walletInfo);
    return txid;
  }

  async sendRMZToken(
    destination: string,
    amount: number,
    options: SendRmzTokenOptions,
  ): Promise<SendRmzTokenResult> {
    const trimmedDestination = destination?.trim();
    if (!trimmedDestination) {
      throw new Error('La dirección de destino es obligatoria.');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El monto del token debe ser un número mayor que cero.');
    }

    if (!options?.mnemonic) {
      throw new Error('Se requiere la frase mnemónica para firmar la transacción.');
    }

    const normalizedMnemonic = this.normalizeMnemonic(options.mnemonic);
    const hdPath = options.hdPath ?? DEFAULT_HD_PATH;
    const feeRate = options.feeRate ?? DEFAULT_FEE_RATE;

    const derivedKeys = this.keyDerivation.deriveFromMnemonic(normalizedMnemonic, hdPath);
    const xecAddress = options.address?.trim() || derivedKeys.address;
    const privateKey = options.privateKey ?? derivedKeys.privateKey;
    const publicKey = options.publicKey ?? derivedKeys.publicKey;

    if (!xecAddress || !privateKey || !publicKey) {
      throw new Error('No se pudo derivar la información necesaria de la cartera.');
    }

    const result = await this.performRmzTokenSend(trimmedDestination, amount, {
      mnemonic: normalizedMnemonic,
      xecAddress,
      hdPath,
      feeRate,
      privateKey,
      publicKey,
    });

    return result;
  }

  private async performRmzTokenSend(
    destination: string,
    amountHuman: number,
    walletInfo: SendRmzHybridWalletInfo,
  ): Promise<SendRmzTokenResult> {
    const targetAddress = destination?.trim();
    if (!targetAddress) {
      throw new Error('La dirección de destino es obligatoria.');
    }

    if (!Number.isFinite(amountHuman) || amountHuman <= 0) {
      throw new Error('El monto del token debe ser un número mayor que cero.');
    }

    const hdPath = walletInfo.hdPath ?? DEFAULT_HD_PATH;
    const feeRate = walletInfo.feeRate ?? DEFAULT_FEE_RATE;

    const normalizedMnemonic = walletInfo.mnemonic
      ? this.normalizeMnemonic(walletInfo.mnemonic)
      : undefined;

    const derivation = normalizedMnemonic
      ? new KeyDerivation({ mnemonic: normalizedMnemonic })
      : this.keyDerivation;

    const derivedKeys = normalizedMnemonic
      ? derivation.deriveFromMnemonic(normalizedMnemonic, hdPath)
      : undefined;

    const sourceAddress =
      walletInfo.xecAddress?.trim() ||
      walletInfo.address?.trim() ||
      derivedKeys?.address;

    if (!sourceAddress) {
      throw new Error('No se pudo determinar la dirección de origen de la cartera.');
    }

    const privateKey = walletInfo.privateKey ?? derivedKeys?.privateKey;
    if (!privateKey) {
      throw new Error('Se requiere la clave privada para firmar la transacción.');
    }

    const publicKey = walletInfo.publicKey ?? derivedKeys?.publicKey;

    const adapterUtxoData = await this.adapterRouter.getUtxos(sourceAddress);
    const utxos = this.normalizeUtxos(adapterUtxoData);

    const info = await this.chronikClient.token(RMZ_TOKEN_ID);
    const decimals = info?.slpTxData?.genesisInfo?.decimals ?? 0;
    const multiplier = 10 ** decimals;
    const atoms = BigInt(Math.round(amountHuman * multiplier));
    if (atoms <= 0n) {
      throw new Error('El monto convertido del token debe ser mayor que cero.');
    }

    const baseAdapter = this.adapterRouter;
    const originalSendTx = baseAdapter.sendTx?.bind(baseAdapter);
    const broadcastTokenTransaction = this.broadcastTokenTransaction.bind(this);
    let broadcastHex: string | null = null;

    const adapter: AdapterRouter = {
      ...baseAdapter,
      sendTx: async (hex: string) => {
        if (typeof hex !== 'string' || !hex) {
          throw new Error('Hex de transacción inválido.');
        }

        broadcastHex = hex;
        try {
          return await broadcastTokenTransaction(hex);
        } catch (error) {
          if (originalSendTx) {
            return originalSendTx(hex);
          }
          throw error;
        }
      },
      getUtxos: async (address: string | string[]): Promise<unknown> => this.fetchUtxos(address),
    };

    const txid = await this.createHybridTokenManager(normalizedMnemonic, adapter).sendTokens(
      RMZ_TOKEN_ID,
      [
        {
          address: targetAddress,
          amount: atoms,
        },
      ],
      {
        mnemonic: normalizedMnemonic,
        xecAddress: sourceAddress,
        hdPath,
        fee: feeRate,
        privateKey,
        publicKey,
      },
      utxos,
      feeRate,
    );

    if (!broadcastHex) {
      throw new Error('No se pudo generar la transacción de eToken RMZ.');
    }

    return { txid, hex: broadcastHex };
  }

  private async fetchUtxos(addresses: string | string[]): Promise<Utxo[]> {
    const addrs = Array.isArray(addresses) ? addresses : [addresses];

    const lists = await Promise.all(
      addrs.map(async (addr) => {
        const decoded = ecashaddr.decode(addr, true);
        const hashHex =
          typeof decoded.hash === 'string'
            ? decoded.hash
            : Buffer.from(decoded.hash).toString('hex');

        const script = this.chronikClient.script('p2pkh', hashHex);

        // Puede regresar ScriptUtxos | ScriptUtxos[] según versión/uso.
        const res: any = await script.utxos();

        const utxos: Utxo[] = Array.isArray(res)
          ? res.flatMap((s: any) => s?.utxos ?? [])
          : res?.utxos ?? [];

        return utxos;
      }),
    );

    return lists.flat();
  }

  private createHybridTokenManager(
    mnemonic?: string,
    adapterOverride?: AdapterRouter,
  ): HybridTokenManager {
    const kd =
      typeof mnemonic === 'string' && mnemonic.length > 0
        ? new KeyDerivation({ mnemonic })
        : this.keyDerivation;

    const adapter = adapterOverride ?? this.adapterRouter;
    const chronik = this.chronikClient;

    return new HybridTokenManager({
      adapter,
      ar: adapter,
      chronik,
      chronikUrls: [...CHRONIK_FALLBACK_URLS],
      keyDerivation: kd,
    });
  }

  private async broadcastTokenTransaction(hex: string): Promise<string> {
    const response = await this.chronikClient.broadcastTx(hex);
    const txid = typeof response === 'string' ? response : response?.txid;

    if (typeof txid === 'string' && txid) {
      return txid;
    }

    throw new Error('La difusión de la transacción no devolvió un identificador válido.');
  }

  private normalizeMnemonic(mnemonic: string): string {
    return mnemonic
      .trim()
      .split(/\s+/u)
      .map((word) => word.toLowerCase())
      .join(' ');
  }

  private normalizeUtxos(utxoData: unknown): any[] {
    if (Array.isArray(utxoData)) {
      if (utxoData.length === 0) {
        return [];
      }

      if (this.looksLikeUtxo(utxoData[0])) {
        return utxoData as any[];
      }

      return utxoData.flatMap((entry) => this.normalizeUtxos(entry));
    }

    if (utxoData && typeof utxoData === 'object') {
      const maybeObject = utxoData as { utxos?: unknown };
      if (maybeObject.utxos !== undefined) {
        return this.normalizeUtxos(maybeObject.utxos);
      }
    }

    return [];
  }

  private looksLikeUtxo(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }

    const record = candidate as Record<string, unknown>;
    return (
      typeof record['outpoint'] === 'object' &&
      record['outpoint'] !== null &&
      typeof (record['outpoint'] as Record<string, unknown>)['txid'] === 'string'
    );
  }

}
