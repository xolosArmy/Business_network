import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import axios from 'axios';
import { ChronikClient, type ScriptUtxo } from 'chronik-client';
import {
  Address,
  ALL_BIP143,
  DEFAULT_DUST_SATS,
  DEFAULT_FEE_SATS_PER_KB,
  HdNode,
  P2PKHSignatory,
  Script,
  TxBuilder,
  entropyToMnemonic,
  mnemonicToSeed,
  toHex,
} from 'ecash-lib';
import { wordlist as ENGLISH_WORDLIST } from '@scure/bip39/wordlists/english';

const STORAGE_KEY = 'rmz_wallet';
const CHRONIK_BASE_URL = 'https://chronik.e.cash';
const CHRONIK_REST_URL = `${CHRONIK_BASE_URL}/xec`;
const DERIVATION_PATH = "m/44'/899'/0'/0/0";
const SATS_PER_XEC = 100n;
const FIXED_FEE_SATS = 1000n;
const MNEMONIC_WORDS = ENGLISH_WORDLIST;
const MNEMONIC_WORDLIST = { words: ENGLISH_WORDLIST, separator: ' ' } as const;

interface ChronikApiOutPoint {
  txid: string;
  outIdx: number;
}

interface ChronikApiUtxo {
  outpoint: ChronikApiOutPoint;
  sats: string | number | bigint;
  token?: unknown;
  isCoinbase?: boolean;
  blockHeight?: number;
}

interface ChronikAddressUtxoResponse {
  utxos?: ChronikApiUtxo[];
}

interface PersistedWalletData {
  mnemonic: string;
}

export interface WalletSnapshot {
  mnemonic: string;
  address: string;
  publicKey: string;
  privateKey: string;
}

interface BuildTxOutput {
  address: string;
  sats: bigint;
}

interface BuildTxParams {
  utxos: ScriptUtxo[];
  outputs: BuildTxOutput[];
  fee?: bigint;
  dust?: bigint;
  feePerKb?: bigint;
}

interface BuiltTransaction {
  hex: string;
  txid: string;
}

class Wallet {
  private static readonly WORDLIST = MNEMONIC_WORDLIST;
  private static readonly WORDS = MNEMONIC_WORDS;

  private readonly spendScript: Script;

  private constructor(
    public readonly mnemonic: string,
    private readonly privateKey: Uint8Array,
    private readonly publicKey: Uint8Array,
    private readonly publicKeyHash: Uint8Array,
    public readonly address: string,
  ) {
    this.spendScript = Script.p2pkh(this.publicKeyHash);
  }

  static async fromRandom(): Promise<Wallet> {
    const entropy = Wallet.getRandomBytes(16);
    const mnemonic = entropyToMnemonic(entropy, Wallet.WORDLIST);
    return Wallet.fromMnemonic(mnemonic);
  }

  static async fromMnemonic(mnemonic: string): Promise<Wallet> {
    const normalized = Wallet.normalizeMnemonic(mnemonic);
    const seed = await mnemonicToSeed(normalized);
    const master = HdNode.fromSeed(seed);
    const accountNode = master.derivePath(DERIVATION_PATH);

    const privateKey = accountNode.seckey();
    if (!privateKey) {
      throw new Error('No se pudo derivar la clave privada de la cartera.');
    }

    const publicKey = accountNode.pubkey();
    const publicKeyHash = accountNode.pkh();
    const address = Address.p2pkh(publicKeyHash).toString();

    return new Wallet(normalized, privateKey, publicKey, publicKeyHash, address);
  }

  toSnapshot(): WalletSnapshot {
    return {
      mnemonic: this.mnemonic,
      address: this.address,
      publicKey: Wallet.bytesToHex(this.publicKey),
      privateKey: Wallet.bytesToHex(this.privateKey),
    };
  }

  serialize(): PersistedWalletData {
    return { mnemonic: this.mnemonic };
  }

  buildTx(params: BuildTxParams): BuiltTransaction {
    if (!params.outputs?.length) {
      throw new Error('Debe especificar al menos un destino para la transacción.');
    }

    const fee = params.fee ?? FIXED_FEE_SATS;
    const dustThreshold = params.dust ?? DEFAULT_DUST_SATS;
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_SATS_PER_KB;

    const preparedOutputs = params.outputs.map((output) => {
      if (!output?.address) {
        throw new Error('La dirección de destino es obligatoria.');
      }
      if (output.sats <= 0n) {
        throw new Error('El monto a enviar debe ser mayor que cero.');
      }
      return {
        sats: output.sats,
        script: Script.fromAddress(output.address).copy(),
      };
    });

    const requiredTotal = preparedOutputs.reduce<bigint>((total, output) => total + output.sats, 0n) + fee;

    const signatory = P2PKHSignatory(this.privateKey, this.publicKey, ALL_BIP143);
    const sortedUtxos = [...params.utxos].sort((a, b) => {
      const satsA = Wallet.toBigInt((a as ScriptUtxo & { sats: bigint | number | string }).sats);
      const satsB = Wallet.toBigInt((b as ScriptUtxo & { sats: bigint | number | string }).sats);
      if (satsA === satsB) {
        return 0;
      }
      return satsA > satsB ? -1 : 1;
    });

    const selected: ScriptUtxo[] = [];
    let totalSelected = 0n;
    for (const utxo of sortedUtxos) {
      selected.push(utxo);
      totalSelected += Wallet.toBigInt((utxo as ScriptUtxo & { sats: bigint | number | string }).sats);
      if (totalSelected >= requiredTotal) {
        break;
      }
    }

    if (totalSelected < requiredTotal) {
      throw new Error('Fondos insuficientes para completar la transacción.');
    }

    const change = totalSelected - requiredTotal;
    if (change >= dustThreshold) {
      preparedOutputs.push({ sats: change, script: this.spendScript.copy() });
    } else if (change > 0n && preparedOutputs.length) {
      preparedOutputs[preparedOutputs.length - 1] = {
        ...preparedOutputs[preparedOutputs.length - 1],
        sats: preparedOutputs[preparedOutputs.length - 1].sats + change,
      };
    }

    const builder = new TxBuilder({
      inputs: selected.map((utxo) => ({
        input: {
          prevOut: {
            txid: utxo.outpoint.txid,
            outIdx: utxo.outpoint.outIdx,
          },
          signData: {
            sats: Wallet.toBigInt((utxo as ScriptUtxo & { sats: bigint | number | string }).sats),
            outputScript: this.spendScript.copy(),
          },
        },
        signatory,
      })),
      outputs: preparedOutputs,
    });

    const signedTx = builder.sign({ feePerKb, dustSats: dustThreshold });

    return {
      hex: toHex(signedTx.ser()),
      txid: signedTx.txid(),
    };
  }

  private static normalizeMnemonic(mnemonic: string): string {
    return mnemonic
      .trim()
      .split(/\s+/u)
      .map((word) => word.toLowerCase())
      .join(' ');
  }

  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  static toBigInt(value: bigint | number | string): bigint {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Valor numérico inválido.');
      }
      return BigInt(Math.trunc(value));
    }
    if (typeof value === 'string') {
      if (!value.trim()) {
        throw new Error('Valor de monto vacío.');
      }
      return BigInt(value);
    }
    throw new Error('Formato de monto no soportado.');
  }

  private static getRandomBytes(length: number): Uint8Array {
    if (length <= 0) {
      throw new Error('El tamaño de la entropía debe ser mayor que cero.');
    }

    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint8Array(length));
    }

    throw new Error('Entorno sin soporte para generación aleatoria criptográfica.');
  }
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly chronik = new ChronikClient([CHRONIK_BASE_URL]);
  private cachedWallet: Wallet | null = null;

  async createWallet(): Promise<WalletSnapshot> {
    const wallet = await Wallet.fromRandom();
    await this.persistWallet(wallet);
    this.cachedWallet = wallet;
    return wallet.toSnapshot();
  }

  async loadWallet(): Promise<WalletSnapshot | null> {
    const wallet = await this.restoreWallet();
    if (!wallet) {
      return null;
    }
    this.cachedWallet = wallet;
    return wallet.toSnapshot();
  }

  async getBalance(): Promise<number> {
    const wallet = await this.requireWallet();
    const totalSats = await this.fetchBalance(wallet.address);
    return Number(totalSats) / Number(SATS_PER_XEC);
  }

  async send(toAddress: string, amount: number): Promise<string> {
    if (!toAddress) {
      throw new Error('La dirección de destino es obligatoria.');
    }
    if (amount === undefined || amount === null) {
      throw new Error('El monto a enviar es obligatorio.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El monto a enviar debe ser mayor que cero.');
    }

    const wallet = await this.requireWallet();
    const utxos = await this.fetchSpendableUtxos(wallet.address);
    if (!utxos.length) {
      throw new Error('No hay fondos disponibles para enviar.');
    }

    const sats = this.xecToSats(amount);
    const { hex, txid } = wallet.buildTx({
      utxos,
      outputs: [{ address: toAddress, sats }],
    });

    const { txid: broadcastedTxid } = await this.chronik.broadcastTx(hex);
    return broadcastedTxid ?? txid;
  }

  async clearWallet(): Promise<void> {
    await Preferences.remove({ key: STORAGE_KEY });
    this.cachedWallet = null;
  }

  private async requireWallet(): Promise<Wallet> {
    if (this.cachedWallet) {
      return this.cachedWallet;
    }

    const restored = await this.restoreWallet();
    if (!restored) {
      throw new Error('No existe una cartera almacenada.');
    }

    this.cachedWallet = restored;
    return restored;
  }

  private async persistWallet(wallet: Wallet): Promise<void> {
    try {
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(wallet.serialize()) });
    } catch (error) {
      throw new Error('No se pudo guardar la cartera en el almacenamiento seguro.');
    }
  }

  private async restoreWallet(): Promise<Wallet | null> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value) as PersistedWalletData;
      if (!parsed?.mnemonic || typeof parsed.mnemonic !== 'string') {
        return null;
      }
      return await Wallet.fromMnemonic(parsed.mnemonic);
    } catch (error) {
      console.warn('No se pudo restaurar la cartera almacenada', error);
      return null;
    }
  }

  private async fetchBalance(address: string): Promise<bigint> {
    try {
      const url = `${CHRONIK_REST_URL}/address/${address}/utxos`;
      const { data } = await axios.get<ChronikAddressUtxoResponse>(url);
      const utxos = Array.isArray(data?.utxos) ? data.utxos : [];
      return utxos
        .filter((utxo) => typeof utxo.token === 'undefined')
        .reduce<bigint>((total, utxo) => total + Wallet.toBigInt(utxo.sats as bigint | number | string), 0n);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo consultar el saldo: ${message}`);
    }
  }

  private async fetchSpendableUtxos(address: string): Promise<ScriptUtxo[]> {
    const response = await this.chronik.address(address).utxos();
    const utxos = Array.isArray(response?.utxos) ? response.utxos : [];
    if (!utxos.length) {
      return [];
    }

    const spendable = utxos.filter((utxo) => typeof utxo.token === 'undefined');
    if (!spendable.length) {
      return [];
    }

    const mature: ScriptUtxo[] = [];
    let chainInfo: { tipHeight: number } | null = null;

    for (const utxo of spendable) {
      if (utxo.isCoinbase) {
        if ((utxo.blockHeight ?? -1) < 0) {
          continue;
        }
        if (!chainInfo) {
          chainInfo = await this.chronik.blockchainInfo();
        }
        if (!chainInfo) {
          continue;
        }
        if (chainInfo.tipHeight - utxo.blockHeight < 100) {
          continue;
        }
      }
      mature.push(utxo);
    }

    return mature;
  }

  private xecToSats(amount: number): bigint {
    const scaled = Math.round(amount * Number(SATS_PER_XEC));
    return BigInt(scaled);
  }
}
