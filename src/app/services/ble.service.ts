import { Injectable } from '@angular/core';
import * as bleno from '@abandonware/bleno';

const SERVICE_UUID = '7e57a1c0-5d8a-4d0a-bf26-2d6d1f4b1234';
const WALLET_ADDRESS_CHARACTERISTIC_UUID = '7e57a1c1-5d8a-4d0a-bf26-2d6d1f4b1234';
const SIGNED_TRANSACTION_CHARACTERISTIC_UUID = '7e57a1c2-5d8a-4d0a-bf26-2d6d1f4b1234';
const DEFAULT_WALLET_ADDRESS = 'RMZ-WALLET-ADDRESS-0001';

@Injectable({
  providedIn: 'root',
})
export class BleService {
  private initialized = false;
  private readonly walletAddress = DEFAULT_WALLET_ADDRESS;

  constructor() {
    this.initializeBleno();
  }

  private initializeBleno(): void {
    if (this.initialized) {
      return;
    }

    if (typeof bleno === 'undefined' || !bleno) {
      console.warn('Bleno no está disponible en esta plataforma.');
      return;
    }

    this.initialized = true;

    const walletAddressBuffer = Buffer.from(this.walletAddress, 'utf8');

    const walletAddressCharacteristic = new bleno.Characteristic({
      uuid: WALLET_ADDRESS_CHARACTERISTIC_UUID,
      properties: ['read'],
      onReadRequest: (offset, callback) => {
        if (offset > walletAddressBuffer.length) {
          callback(bleno.Characteristic.RESULT_INVALID_OFFSET);
          return;
        }

        callback(
          bleno.Characteristic.RESULT_SUCCESS,
          walletAddressBuffer.slice(offset)
        );
      },
    });

    const signedTransactionCharacteristic = new bleno.Characteristic({
      uuid: SIGNED_TRANSACTION_CHARACTERISTIC_UUID,
      properties: ['write'],
      onWriteRequest: (data, offset, withoutResponse, callback) => {
        if (offset !== 0) {
          callback(bleno.Characteristic.RESULT_ATTR_NOT_LONG);
          return;
        }

        this.handleSignedTransaction(Buffer.from(data));
        callback(bleno.Characteristic.RESULT_SUCCESS);
      },
    });

    const primaryService = new bleno.PrimaryService({
      uuid: SERVICE_UUID,
      characteristics: [walletAddressCharacteristic, signedTransactionCharacteristic],
    });

    bleno.on('stateChange', (state: string) => {
      if (state === 'poweredOn') {
        bleno.startAdvertising('RMZWallet', [SERVICE_UUID], (error?: Error | null) => {
          if (error) {
            console.error('Error al iniciar la publicidad BLE:', error);
          }
        });
      } else {
        bleno.stopAdvertising();
      }
    });

    bleno.on('advertisingStart', (error?: Error | null) => {
      if (error) {
        console.error('Error al iniciar la publicidad BLE:', error);
        return;
      }

      bleno.setServices([primaryService], (servicesError?: Error | null) => {
        if (servicesError) {
          console.error('Error al configurar los servicios BLE:', servicesError);
        }
      });
    });
  }

  private handleSignedTransaction(data: Buffer): void {
    const payload = data.toString('hex');
    console.log('Transacción firmada recibida a través de BLE:', payload);
    // Aquí podrías procesar y almacenar la transacción firmada según las necesidades de la aplicación.
  }
}
