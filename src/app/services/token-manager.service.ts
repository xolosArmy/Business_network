import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import {
  AdapterRouter,
  HybridTokenManager,
  type HybridTokenBalance,
  KeyDerivation,
} from 'minimal-xec-wallet';

import { addressToHash160 } from '../utils/address';

import {
  CHRONIK_FALLBACK_URLS,
  CHRONIK_URL,
  RMZ_TOKEN_ID,
} from './chronik.constants';

const DEFAULT_HD_PATH = "m/44'/899'/0'/0/0";
const DEFAULT_FEE_RATE = 1.2;

interface AdapterRouterWithBroadcast extends AdapterRouter {
  sendTx: (hex: string) => Promise<string | { txid?: string }>;
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
  private readonly adapterRouter = new AdapterRouter({
    chronik: this.chronikClient,
    chronikUrls: [...CHRONIK_FALLBACK_URLS],
  });
  private readonly hybridTokenManager = new HybridTokenManager({
    chronik: this.chronikClient,
    ar: this.adapterRouter,
    chronikUrls: [...CHRONIK_FALLBACK_URLS],
  });
  private readonly keyDerivation = new KeyDerivation();

  get chronik(): ChronikClient {
    return this.chronikClient;
  }

  get manager(): HybridTokenManager {
    return this.hybridTokenManager;
  }

  async getTokenBalance(tokenId: string, address: string): Promise<TokenBalance> {
    const utxoData = await this.adapterRouter.getUtxos(address);
    const utxos = this.normalizeUtxos(utxoData);
    return this.hybridTokenManager.getTokenBalance(tokenId, utxos);
  }

  async listTokens(address: string): Promise<TokenBalance[]> {
    const utxoData = await this.adapterRouter.getUtxos(address);
    const utxos = this.normalizeUtxos(utxoData);
    return this.hybridTokenManager.listTokensFromUtxos(utxos);
  }

  async sendRmzToken(
    destAddress: string,
    amountHuman: number,
    walletInfo: SendRmzHybridWalletInfo,
  ): Promise<string> {
    const destination = destAddress?.trim();
    if (!destination) {
      throw new Error('La dirección de destino es obligatoria.');
    }

    if (!Number.isFinite(amountHuman) || amountHuman <= 0) {
      throw new Error('El monto del token debe ser un número mayor que cero.');
    }

    if (!walletInfo) {
      throw new Error('Se requiere la información de la cartera.');
    }

    const hdPath = walletInfo.hdPath ?? DEFAULT_HD_PATH;
    const feeRate = walletInfo.feeRate ?? DEFAULT_FEE_RATE;

    const normalizedMnemonic = walletInfo.mnemonic
      ? this.normalizeMnemonic(walletInfo.mnemonic)
      : undefined;

    const derivedKeys = normalizedMnemonic
      ? this.keyDerivation.deriveFromMnemonic(normalizedMnemonic, hdPath)
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

    const hash160 = addressToHash160(sourceAddress);
    const utxoResponse = await this.chronikClient.script('p2pkh', hash160).utxos();
    const utxos = this.normalizeUtxos(utxoResponse);

    const balanceInfo = await this.hybridTokenManager.getTokenBalance(
      RMZ_TOKEN_ID,
      utxos,
    );

    let decimals = typeof balanceInfo?.decimals === 'number' ? balanceInfo.decimals : 0;
    if (!Number.isFinite(decimals) || decimals < 0) {
      const tokenInfo = await this.chronikClient.token(RMZ_TOKEN_ID);
      const fallbackDecimals = tokenInfo?.genesisInfo?.decimals;
      decimals = Number.isFinite(fallbackDecimals) && fallbackDecimals >= 0 ? fallbackDecimals : 0;
    }

    const atoms = this.toTokenAtoms(amountHuman, decimals);
    if (atoms <= 0n) {
      throw new Error('El monto convertido del token debe ser mayor que cero.');
    }

    const outputs = [
      {
        address: destination,
        amount: Number(atoms),
        value: amountHuman,
      },
    ];

    const adapter = this.adapterRouter as AdapterRouterWithBroadcast;
    const previousSendTx = adapter.sendTx?.bind(adapter);
    let broadcastHex: string | null = null;

    adapter.sendTx = async (hex: string) => {
      if (typeof hex !== 'string' || !hex) {
        throw new Error('Hex de transacción inválido.');
      }

      broadcastHex = hex;

      try {
        const response = await this.chronikClient.broadcastTx(hex);

        if (response && typeof response === 'object') {
          const possibleTxid = (response as { txid?: unknown }).txid;
          if (typeof possibleTxid === 'string' && possibleTxid) {
            return possibleTxid;
          }
        }

        if (typeof response === 'string' && response) {
          return response;
        }
      } catch (error) {
        if (previousSendTx) {
          return previousSendTx(hex);
        }

        const message =
          error instanceof Error ? error.message : 'Error desconocido al difundir la transacción.';
        throw new Error(`Error al difundir la transacción: ${message}`);
      }

      if (previousSendTx) {
        return previousSendTx(hex);
      }

      throw new Error('La difusión de la transacción no devolvió un identificador válido.');
    };

    try {
      const txid = await this.hybridTokenManager.sendTokens(
        RMZ_TOKEN_ID,
        outputs,
        {
          mnemonic: normalizedMnemonic ?? '',
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
        throw new Error('No se pudo generar la transacción de token RMZ.');
      }

      return txid;
    } finally {
      if (previousSendTx) {
        adapter.sendTx = previousSendTx;
      } else {
        delete adapter.sendTx;
      }
    }
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

    const utxoData = await this.adapterRouter.getUtxos(xecAddress);
    const utxos = this.normalizeUtxos(utxoData);

    const outputs = [
      {
        address: trimmedDestination,
        amount,
      },
    ];

    const adapter = this.adapterRouter as AdapterRouterWithBroadcast;
    const previousSendTx = adapter.sendTx?.bind(adapter);
    let broadcastHex: string | null = null;

    adapter.sendTx = async (hex: string) => {
      if (typeof hex !== 'string' || !hex) {
        throw new Error('Hex de transacción inválido.');
      }

      broadcastHex = hex;

      try {
        const response = await this.chronik.broadcastTx(hex);

        if (response && typeof response === 'object') {
          const possibleTxid = (response as { txid?: unknown }).txid;
          if (typeof possibleTxid === 'string' && possibleTxid) {
            return possibleTxid;
          }
        }

        if (typeof response === 'string' && response) {
          return response;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido al difundir la transacción.';
        throw new Error(`Error al difundir la transacción: ${message}`);
      }

      throw new Error('La difusión de la transacción no devolvió un identificador válido.');
    };

    try {
      const txid = await this.hybridTokenManager.sendTokens(
        RMZ_TOKEN_ID,
        outputs,
        {
          mnemonic: normalizedMnemonic,
          xecAddress,
          hdPath,
          fee: feeRate,
          privateKey,
          publicKey,
        },
        utxos,
        feeRate,
      );

      if (!broadcastHex) {
        throw new Error('No se pudo generar la transacción de token RMZ.');
      }

      return { txid, hex: broadcastHex };
    } finally {
      if (previousSendTx) {
        adapter.sendTx = previousSendTx;
      } else {
        delete adapter.sendTx;
      }
    }
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

  private toTokenAtoms(amount: number, decimals: number): bigint {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El monto debe ser un número mayor que cero.');
    }

    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new Error('Los decimales del token no son válidos.');
    }

    if (decimals === 0) {
      return BigInt(Math.floor(amount));
    }

    const multiplier = 10n ** BigInt(decimals);
    const amountFixed = amount.toFixed(decimals);
    const [integerPart, fractionalPart = ''] = amountFixed.split('.');
    const sanitizedFractional = fractionalPart.padEnd(decimals, '0');

    const integerAtoms = BigInt(integerPart) * multiplier;
    const fractionalAtoms = sanitizedFractional ? BigInt(sanitizedFractional) : 0n;

    return integerAtoms + fractionalAtoms;
  }
}
