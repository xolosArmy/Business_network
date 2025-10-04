import { Injectable, NgZone } from '@angular/core';
import {
  BleClient,
  BleDevice,
  ScanResult,
  dataViewToText,
  textToDataView,
} from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';

import { WalletService } from './wallet.service';

interface BleTransferPayload {
  amount?: number;
  toAddress?: string;
  txid?: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class BleService {
  private readonly SERVICE_UUID = 'b27a1e88-cc7f-46b2-8cb9-9b91ef4f0e11';
  private readonly CHARACTERISTIC_UUID = '6a57bcd7-1e2e-4b8d-97b5-47f2c6de9f17';

  private initialized = false;
  private advertisingName: string | null = null;
  private scanning = false;
  private connectedDevice: BleDevice | null = null;
  private notificationsActive = false;

  constructor(
    private readonly wallet: WalletService,
    private readonly zone: NgZone,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await BleClient.initialize({ androidNeverForLocation: true });
    this.initialized = true;
  }

  private async ensureEnabled(): Promise<void> {
    if (!(await BleClient.isEnabled())) {
      try {
        await BleClient.requestEnable();
      } catch (error) {
        console.warn('[BLE] El usuario no habilitó Bluetooth.', error);
      }
    }
  }

  async init(): Promise<void> {
    await this.ensureInitialized();
    await this.ensureEnabled();
  }

  async advertise(address: string): Promise<void> {
    await this.init();

    this.advertisingName = `RMZWallet-${address.slice(-4)}`;

    if (Capacitor.getPlatform() === 'web') {
      console.warn('[BLE] La publicidad BLE no está disponible en navegadores.');
    }

    await Toast.show({ text: 'Wallet lista para anuncios BLE locales.' });
  }

  async scanAndConnect(): Promise<void> {
    await this.init();

    if (this.connectedDevice) {
      await Toast.show({ text: 'Ya existe un dispositivo BLE conectado.' });
      return;
    }

    if (this.scanning) {
      return;
    }

    this.scanning = true;

    try {
      await Toast.show({ text: 'Buscando wallets BLE cercanas…' });
      await BleClient.stopLEScan().catch(() => undefined);

      await BleClient.requestLEScan(
        { services: [this.SERVICE_UUID] },
        (result: ScanResult) => {
          const device = result.device;
          if (!device?.deviceId) {
            return;
          }

          const name = device.name ?? result.localName ?? '';
          const matchesName = name.startsWith('RMZWallet');
          const matchesService = (result.uuids ?? []).some(
            (uuid) => uuid.toLowerCase() === this.SERVICE_UUID,
          );

          if (!matchesName && !matchesService) {
            return;
          }

          this.zone.run(() => {
            this.handleDeviceDiscovered(device).catch((error) => {
              console.error('[BLE] Error al conectar con dispositivo.', error);
            });
          });
        },
      );
    } catch (error) {
      this.scanning = false;
      console.error('[BLE] Falló el escaneo.', error);
      throw error;
    }
  }

  private async handleDeviceDiscovered(device: BleDevice): Promise<void> {
    if (!this.scanning || this.connectedDevice) {
      return;
    }

    await this.stopScanning();

    try {
      await Toast.show({ text: `Conectando con ${device.name ?? device.deviceId}` });
      await BleClient.connect(device.deviceId, async () => {
        this.zone.run(async () => {
          this.connectedDevice = null;
          this.notificationsActive = false;
          await Toast.show({ text: 'Dispositivo BLE desconectado.' });
        });
      });

      this.connectedDevice = device;
      await Toast.show({ text: `Conectado a ${device.name ?? device.deviceId}` });
    } catch (error) {
      await Toast.show({ text: 'No fue posible establecer la conexión BLE.' });
      throw error;
    }
  }

  async sendTx(toAddress: string, amount: number): Promise<void> {
    await this.init();

    if (!this.connectedDevice) {
      throw new Error('No hay un dispositivo BLE conectado.');
    }

    const tx = await this.wallet.enviar(toAddress, amount);
    const payload: BleTransferPayload = {
      ...tx,
      amount,
      toAddress,
      advertisedName: this.advertisingName ?? undefined,
    };

    const value = textToDataView(JSON.stringify(payload));

    await BleClient.write(
      this.connectedDevice.deviceId,
      this.SERVICE_UUID,
      this.CHARACTERISTIC_UUID,
      value,
    );

    await Toast.show({ text: `Tx enviada vía BLE a ${toAddress}` });
  }

  async receiveTx(callback: (tx: BleTransferPayload) => void): Promise<void> {
    await this.init();

    if (!this.connectedDevice) {
      throw new Error('No hay un dispositivo BLE conectado.');
    }

    if (this.notificationsActive) {
      return;
    }

    await BleClient.startNotifications(
      this.connectedDevice.deviceId,
      this.SERVICE_UUID,
      this.CHARACTERISTIC_UUID,
      (value) => {
        const text = dataViewToText(value);

        try {
          const decoded = JSON.parse(text) as BleTransferPayload;
          this.zone.run(() => {
            callback(decoded);
          });
          const txid = typeof decoded.txid === 'string' ? decoded.txid : 'desconocido';
          Toast.show({ text: `Tx recibida vía BLE: ${txid}` });
        } catch (error) {
          console.error('[BLE] No fue posible parsear la transacción recibida.', error);
        }
      },
    );

    this.notificationsActive = true;
    await Toast.show({ text: 'Escuchando transacciones BLE entrantes…' });
  }

  async stop(): Promise<void> {
    await this.stopScanning();

    if (this.connectedDevice) {
      if (this.notificationsActive) {
        await BleClient.stopNotifications(
          this.connectedDevice.deviceId,
          this.SERVICE_UUID,
          this.CHARACTERISTIC_UUID,
        ).catch(() => undefined);
        this.notificationsActive = false;
      }

      await BleClient.disconnect(this.connectedDevice.deviceId).catch(() => undefined);
      this.connectedDevice = null;
    }
  }

  private async stopScanning(): Promise<void> {
    if (!this.scanning) {
      return;
    }

    this.scanning = false;

    await BleClient.stopLEScan().catch(() => undefined);
  }
}
