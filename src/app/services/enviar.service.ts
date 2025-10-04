import { Injectable } from '@angular/core';
import { Wallet } from 'ecash-wallet';
import type { WalletInfo } from './cartera.service';

type WalletSource =
  | Pick<WalletInfo, 'mnemonic' | 'address' | 'privateKey'>
  | { mnemonic: string; privateKey: string; address?: string };

@Injectable({ providedIn: 'root' })
export class EnviarService {
  async sendTransaction(fromWallet: WalletSource, toAddress: string, amount: number): Promise<string> {
    try {
      const mnemonic = fromWallet?.mnemonic?.trim();
      if (!mnemonic) {
        throw new Error('La cartera de origen debe incluir la frase mnemónica.');
      }
      const privateKey = fromWallet?.privateKey?.trim();
      if (!privateKey) {
        throw new Error('La cartera de origen debe incluir la llave privada.');
      }
      const destination = toAddress?.trim();
      if (!destination) {
        throw new Error('La dirección de destino es obligatoria.');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('El monto a enviar debe ser mayor que cero.');
      }

      const wallet = new Wallet(privateKey);

      const txid = await wallet.send(destination, amount);
      if (!txid) {
        throw new Error('No se recibió el identificador de la transacción.');
      }

      return String(txid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo enviar la transacción: ${message}`);
    }
  }
}
