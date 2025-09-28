import { Injectable } from '@angular/core';
import { Address } from 'ecash-lib';
import { ChronikClient, type ScriptUtxo } from 'chronik-client';

const DEFAULT_CHRONIK_URL = 'https://chronik.e.cash';
const SATS_PER_XEC = 100n;

@Injectable({ providedIn: 'root' })
export class SaldoService {
  private chronik?: ChronikClient;

  constructor() {}

  async getBalance(address: string): Promise<number> {
    const normalized = address?.trim();
    if (!normalized) {
      throw new Error('La dirección es obligatoria.');
    }

    const parsedAddress = this.parseAddress(normalized);
    const chronik = this.getChronikClient();

    const response = await chronik.address(parsedAddress).utxos();
    const utxos = Array.isArray(response?.utxos) ? response.utxos : [];

    const spendable = utxos.filter((utxo) => !utxo.token);
    const totalSats = spendable.reduce<bigint>(
      (total, utxo) => total + this.extractSatoshis(utxo),
      0n,
    );

    return Number(totalSats) / Number(SATS_PER_XEC);
  }

  formatBalance(balance: number): string {
    if (!Number.isFinite(balance)) {
      return '0.00';
    }

    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balance);
  }

  private parseAddress(address: string): string {
    try {
      const parsed = Address.parse(address).cash();
      return parsed.toString();
    } catch (error) {
      throw new Error('Dirección eCash inválida.');
    }
  }

  private extractSatoshis(utxo: ScriptUtxo): bigint {
    const { sats } = utxo as ScriptUtxo & { sats: bigint | number | string };
    return typeof sats === 'bigint' ? sats : BigInt(sats);
  }

  private getChronikClient(): ChronikClient {
    if (!this.chronik) {
      this.chronik = new ChronikClient([DEFAULT_CHRONIK_URL]);
    }
    return this.chronik;
  }
}
