import { Injectable } from '@angular/core';
import { ChronikClient } from 'chronik-client';
import { Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';

type WalletSource = Pick<WalletInfo, 'mnemonic' | 'address'> | { mnemonic: string; address?: string };

const CHRONIK_URL = 'https://chronik.e.cash';
const SATS_PER_XEC = 100n;

@Injectable({ providedIn: 'root' })
export class EnviarService {
  private readonly chronikClient = new ChronikClient([CHRONIK_URL]);

  async sendTransaction(fromWallet: WalletSource, toAddress: string, amount: number): Promise<string> {
    try {
      const mnemonic = fromWallet?.mnemonic?.trim();
      if (!mnemonic) {
        throw new Error('La cartera de origen debe incluir la frase mnemónica.');
      }
      const destination = toAddress?.trim();
      if (!destination) {
        throw new Error('La dirección de destino es obligatoria.');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('El monto a enviar debe ser mayor que cero.');
      }

      const satsToSend = this.xecToSats(amount);
      if (satsToSend <= 0n) {
        throw new Error('El monto a enviar debe ser mayor que cero.');
      }

      const wallet = Wallet.fromMnemonic(mnemonic, this.chronikClient);
      await wallet.sync();

      const sendResult = await wallet
        .action({
          outputs: [
            {
              address: destination,
              sats: satsToSend,
            },
          ],
        })
        .build()
        .broadcast();

      const txid = sendResult.broadcasted?.[0];
      if (!sendResult.success || !txid) {
        const errorMessage = sendResult.errors?.[0] ?? 'La red rechazó la transacción.';
        throw new Error(errorMessage);
      }

      return txid;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo enviar la transacción: ${message}`);
    }
  }

  private xecToSats(amount: number): bigint {
    const cents = Math.round(amount * Number(SATS_PER_XEC));
    return BigInt(cents);
  }
}
