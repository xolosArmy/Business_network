import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import { ChronikClient } from 'chronik-client';
import { ecashToP2PKHHash160Hex } from '../utils/chronik';

import { CHRONIK_URL, RMZ_TOKEN_ID } from './chronik.constants';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private wallet?: Wallet;
  private readonly chronikClient: ChronikClient = new ChronikClient(CHRONIK_URL);

  async loadFromMnemonic(mnemonic: string): Promise<Wallet> {
    this.wallet = await Wallet.fromMnemonic(mnemonic, this.chronikClient);
    return this.wallet;
  }

  async enviar(toAddress: string, amountSats: number): Promise<string> {
    // TODO: Implementar con la API actual de ecash-wallet.
    // Por ahora, deja un placeholder que no rompa la compilación.
    console.warn('[WalletService.enviar] Implementación pendiente', { toAddress, amountSats });
    return Promise.resolve('pending-impl');
  }

  getAddress(): string {
    if (!this.wallet) {
      throw new Error('Wallet no inicializada');
    }
    return this.wallet.address;
  }

  async getBalance(addressOrWallet?: string | { address: string }): Promise<number> {
    const address = typeof addressOrWallet === 'string'
      ? addressOrWallet
      : addressOrWallet?.address ?? this.wallet?.address;

    if (!address) {
      throw new Error('Wallet no inicializada y no se proporcionó dirección');
    }

    const hash160 = ecashToP2PKHHash160Hex(address);
    const chronikScript = this.chronikClient.script('p2pkh', hash160);
    const { utxos } = await chronikScript.utxos();
    return utxos.reduce((sum: number, utxo: any) => {
      const sats = typeof utxo.sats === 'bigint' ? Number(utxo.sats) : Number(utxo.sats ?? 0);
      return sum + (Number.isFinite(sats) ? sats : 0);
    }, 0);
  }

  async subscribeRmz(
    address: string,
    onChange: () => void | Promise<void>,
  ): Promise<() => void> {
    const hash160 = ecashToP2PKHHash160Hex(address);
    const expectedOutputScript = `76a914${hash160}88ac`.toLowerCase();

    const handledTxids = new Set<string>();

    const ws = this.chronikClient.ws({
      onMessage: async msg => {
        const { type } = msg as { type?: string };
        const txid = (msg as { txid?: string }).txid;

        if (!txid || handledTxids.has(txid) || (type !== 'AddedToMempool' && type !== 'Confirmed')) {
          return;
        }

        try {
          const tx = await this.chronikClient.tx(txid);
          const tokenId = tx.slpTxData?.slpMeta?.tokenId?.toLowerCase();
          if (tokenId !== RMZ_TOKEN_ID) {
            return;
          }

          const hasTokenOutput = tx.outputs?.some(output => {
            return output.slpToken && output.outputScript?.toLowerCase() === expectedOutputScript;
          });

          if (hasTokenOutput) {
            handledTxids.add(txid);
            await onChange();
          }
        } catch (error) {
          console.warn('Error processing RMZ subscription message', { txid, error });
        }
      },
    });

    await ws.waitForOpen();
    ws.subscribe('p2pkh', hash160);

    return () => ws.close();
  }

  async createAndBroadcastTx(_toAddress: string, _amountSats: number): Promise<string> {
    throw new Error('createAndBroadcastTx: implementar usando tu flujo de envío (enviar.service o ecash-lib)');
  }

  async signTx(_toAddress: string, _amountSats: number): Promise<string> {
    throw new Error('signTx: implementar firma de TX si la necesitas por BLE');
  }
}
