import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import {
  Address,
  ALL_BIP143,
  HdNode,
  P2PKHSignatory,
  Script,
  TxBuilder,
  mnemonicToSeed,
  toHex,
} from 'ecash-lib';
import type { WalletInfo } from './cartera.service';

type WalletSource = Pick<WalletInfo, 'mnemonic' | 'address'> | { mnemonic: string; address?: string };

interface ChronikUtxo {
  outpoint: {
    txid: string;
    outIdx: number;
  };
  sats: string | number | bigint;
  token?: unknown;
  isCoinbase?: boolean;
  blockHeight?: number;
}

const DERIVATION_PATH = "m/44'/899'/0'/0/0";
const CHRONIK_URL = 'https://chronik.e.cash';
const FIXED_FEE_SATS = 1000n;
const DUST_SATS = 546n;

@Injectable({ providedIn: 'root' })
export class EnviarService {
  private chronikClient = new ChronikClient([CHRONIK_URL]);

  async sendTransaction(fromWallet: WalletSource, toAddress: string, amount: number): Promise<string> {
    try {
      if (!fromWallet?.mnemonic) {
        throw new Error('La cartera de origen debe incluir la frase mnemónica.');
      }
      if (!toAddress) {
        throw new Error('La dirección de destino es obligatoria.');
      }
      const satsToSend = this.xecToSats(amount);
      if (satsToSend <= 0n) {
        throw new Error('El monto a enviar debe ser mayor que cero.');
      }

      const seed = await mnemonicToSeed(fromWallet.mnemonic);
      const master = HdNode.fromSeed(seed);
      const accountNode = master.derivePath(DERIVATION_PATH);

      const privateKey = accountNode.seckey();
      const publicKey = accountNode.pubkey();
      const publicKeyHash = accountNode.pkh();

      if (!privateKey) {
        throw new Error('No se pudo derivar la clave privada.');
      }

      const sourceAddress = Address.p2pkh(publicKeyHash).address;
      const spendScript = Script.p2pkh(publicKeyHash);
      const destinationScript = Script.fromAddress(toAddress);
      const changeScript = Script.fromAddress(sourceAddress);
      const signatory = P2PKHSignatory(privateKey, publicKey, ALL_BIP143);

      const utxos = await this.getSpendableUtxos(sourceAddress);
      if (!utxos.length) {
        throw new Error('No hay UTXOs disponibles para gastar.');
      }

      const requiredTotal = satsToSend + FIXED_FEE_SATS;
      const selected: ChronikUtxo[] = [];
      let total = 0n;
      for (const utxo of utxos) {
        selected.push(utxo);
        total += this.toBigInt(utxo.sats);
        if (total >= requiredTotal) {
          break;
        }
      }

      if (total < requiredTotal) {
        throw new Error('Fondos insuficientes para completar la transacción.');
      }

      const change = total - requiredTotal;
      const outputs = [{ sats: satsToSend, script: destinationScript.copy() }];
      if (change >= DUST_SATS) {
        outputs.push({ sats: change, script: changeScript.copy() });
      }

      const builder = new TxBuilder({
        inputs: selected.map((utxo) => ({
          input: {
            prevOut: {
              txid: utxo.outpoint.txid,
              outIdx: utxo.outpoint.outIdx,
            },
            signData: {
              sats: this.toBigInt(utxo.sats),
              outputScript: spendScript.copy(),
            },
          },
          signatory,
        })),
        outputs,
      });

      const transaction = builder.sign();
      const rawHex = toHex(transaction.ser());
      const { txid } = await this.chronikClient.broadcastTx(rawHex);
      return txid;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo enviar la transacción: ${message}`);
    }
  }

  private async getSpendableUtxos(address: string): Promise<ChronikUtxo[]> {
    const utxoResponse = await this.chronikClient.address(address).utxos();
    const utxos = Array.isArray(utxoResponse?.utxos) ? (utxoResponse.utxos as ChronikUtxo[]) : [];
    const spendable = utxos.filter((utxo) => !utxo.token);

    if (!spendable.length) {
      return [];
    }

    const mature: ChronikUtxo[] = [];
    let chainInfo: { tipHeight: number } | null = null;

    for (const utxo of spendable) {
      if (utxo.isCoinbase) {
        if ((utxo.blockHeight ?? -1) < 0) {
          continue;
        }
        if (!chainInfo) {
          chainInfo = await this.chronikClient.blockchainInfo();
        }
        if (!chainInfo || utxo.blockHeight === undefined) {
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
    if (amount === undefined || amount === null) {
      throw new Error('El monto es obligatorio.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Monto inválido.');
    }
    const cents = Math.round(amount * 100);
    return BigInt(cents);
  }

  private toBigInt(value: string | number | bigint): bigint {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Valor numérico inválido.');
      }
      return BigInt(Math.trunc(value));
    }
    return BigInt(value);
  }
}
