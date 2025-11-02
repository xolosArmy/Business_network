import { Injectable, Injector, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
import { TransactionsService } from './transactions.service';
import { TxBLEService } from './tx-ble.service';

interface BleTransferPayload {
  amount?: number;
  toAddress?: string;
  txid?: string;
  [key: string]: unknown;
}

interface ScanOptions {
  autoConnect?: boolean;
  onDeviceDiscovered?: (device: BleDevice) => void;
}

@Injectable({ providedIn: 'root' })
export class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private rxCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly onDisconnectedHandler: EventListener = this.onDisconnected.bind(this);

  private readonly SERVICE_UUID = 'b27a1e88-cc7f-46b2-8cb9-9b91ef4f0e11';
  private readonly CHARACTERISTIC_UUID = '6a57bcd7-1e2e-4b8d-97b5-47f2c6de9f17';

  private initialized = false;
  private advertisingName: string | null = null;
  private scanning = false;
  public connectedDevice: BleDevice | null = null;
  private notificationsActive = false;
  private rxNotificationHandler: ((event: Event) => void) | null = null;
  private discoveredDevices = new Map<string, BleDevice>();
  private readonly chronikUrl = 'https://chronik.e.cash';
  private txBleService: TxBLEService | null = null;

  constructor(
    private readonly walletService: WalletService,
    private readonly zone: NgZone,
    private readonly http: HttpClient,
    private readonly txs: TransactionsService,
    private readonly injector: Injector,
  ) {}

  private get tx(): TxBLEService {
    if (!this.txBleService) {
      this.txBleService = this.injector.get(TxBLEService);
    }
    return this.txBleService;
  }

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

  async scanAndConnect(options: ScanOptions = {}): Promise<void> {
    if (options.onDeviceDiscovered || options.autoConnect === false) {
      await this.legacyScanAndConnect(options);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      console.warn('[BLE] Web Bluetooth no disponible. Usando flujo legacy si está soportado.');
      await this.legacyScanAndConnect(options);
      return;
    }

    try {
      if (this.server?.connected) {
        this.server.disconnect();
      }

      if (this.device) {
        this.device.removeEventListener('gattserverdisconnected', this.onDisconnectedHandler);
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', '0000ffe0-0000-1000-8000-00805f9b34fb'],
      });

      device.addEventListener('gattserverdisconnected', this.onDisconnectedHandler);

      const gatt = device.gatt;
      if (!gatt) {
        throw new Error('El dispositivo no expone GATT.');
      }

      const server = await gatt.connect();
      const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      const txCharacteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');

      this.device = device;
      this.server = server;
      this.txCharacteristic = txCharacteristic;
      this.rxCharacteristic = txCharacteristic;
      this.listenForIncoming();

      console.info(`[BLE] Dispositivo BLE conectado: ${device.name ?? 'Sin nombre'}`);
      await this.notify(`Dispositivo BLE conectado: ${device.name ?? 'Sin nombre'}`);
    } catch (error) {
      console.error('[BLE] Error al conectar BLE.', error);
      await this.notify('Error al conectar BLE');
      await this.legacyScanAndConnect(options).catch(() => undefined);
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.txCharacteristic) {
      console.warn('[BLE] No hay característica TX disponible para enviar mensajes.');
      await this.notify('No hay dispositivo BLE conectado');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const value = encoder.encode(message);
      await this.txCharacteristic.writeValue(value);
      console.info(`[BLE] Mensaje BLE enviado: ${message}`);
      await this.notify('Mensaje BLE enviado');
    } catch (error) {
      console.error('[BLE] No fue posible enviar el mensaje BLE.', error);
      await this.notify('Error al enviar mensaje BLE');
    }
  }

  listenForIncoming(): void {
    if (!this.rxCharacteristic) {
      return;
    }

    if (this.rxNotificationHandler) {
      this.rxCharacteristic.removeEventListener(
        'characteristicvaluechanged',
        this.rxNotificationHandler,
      );
      this.rxNotificationHandler = null;
    }

    this.rxNotificationHandler = (event: Event) => {
      const characteristic = event.target as BluetoothRemoteGATTCharacteristic | null;
      const dataView = characteristic?.value ?? null;
      if (!dataView) {
        return;
      }

      const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
      const value = new TextDecoder().decode(bytes);
      console.log('📩 Mensaje BLE recibido:', value);
      void this.tx.receiveAndBroadcast(value);
    };

    void this.rxCharacteristic
      .startNotifications()
      .then(() => {
        this.rxCharacteristic?.addEventListener(
          'characteristicvaluechanged',
          this.rxNotificationHandler!,
        );
      })
      .catch((error) => {
        console.error('[BLE] No fue posible iniciar notificaciones RX.', error);
      });
  }

  private onDisconnected(): void {
    console.warn('[BLE] Dispositivo BLE desconectado.');
    void this.notify('Dispositivo BLE desconectado');
    this.device = null;
    this.server = null;
    this.txCharacteristic = null;
    if (this.rxCharacteristic && this.rxNotificationHandler) {
      this.rxCharacteristic.removeEventListener(
        'characteristicvaluechanged',
        this.rxNotificationHandler,
      );
    }
    this.rxNotificationHandler = null;
    this.rxCharacteristic = null;
  }

  public async notify(message: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.info(`[BLE] ${message}`);
      return;
    }

    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.warn('[BLE] No se pudo solicitar permiso de notificaciones.', error);
      }
    }

    if (Notification.permission === 'granted') {
      try {
        new Notification('RMZ Wallet', {
          body: message,
          icon: 'assets/icons/icon-192x192.png',
        });
      } catch (error) {
        console.warn('[BLE] No se pudo mostrar la notificación.', error);
      }
    } else {
      console.info(`[BLE] ${message}`);
    }
  }

  private async legacyScanAndConnect(options: ScanOptions = {}): Promise<void> {
    const { autoConnect = true, onDeviceDiscovered } = options;

    await this.init();

    if (this.connectedDevice && autoConnect) {
      await Toast.show({ text: 'Ya existe un dispositivo BLE conectado.' });
      return;
    }

    if (this.scanning) {
      if (!autoConnect && onDeviceDiscovered) {
        this.zone.run(() => {
          for (const device of this.discoveredDevices.values()) {
            onDeviceDiscovered(device);
          }
        });
      }
      return;
    }

    this.scanning = true;

    if (!autoConnect) {
      this.discoveredDevices.clear();
    }

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
            const stored = this.storeDiscoveredDevice(device);
            if (!autoConnect) {
              onDeviceDiscovered?.(stored);
              return;
            }

            this.handleDeviceDiscovered(stored).catch((error) => {
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

  async connect(deviceId: string): Promise<BleDevice> {
    await this.init();

    if (this.connectedDevice?.deviceId === deviceId) {
      return this.connectedDevice;
    }

    if (this.connectedDevice && this.connectedDevice.deviceId !== deviceId) {
      await this.stop();
    }

    const device = this.discoveredDevices.get(deviceId) ?? ({
      deviceId,
      name: deviceId,
    } as BleDevice);

    return this.connectToDevice(device);
  }

  private async handleDeviceDiscovered(device: BleDevice): Promise<void> {
    if (!this.scanning || this.connectedDevice) {
      return;
    }

    await this.connectToDevice(device);
  }

  private async connectToDevice(device: BleDevice): Promise<BleDevice> {
    await this.stopScanning();

    const stored = this.storeDiscoveredDevice(device);

    try {
      await Toast.show({ text: `Conectando con ${stored.name ?? stored.deviceId}` });
      await BleClient.connect(stored.deviceId, async () => {
        this.zone.run(async () => {
          this.connectedDevice = null;
          this.notificationsActive = false;
          await Toast.show({ text: 'Dispositivo BLE desconectado.' });
        });
      });

      this.connectedDevice = stored;
      await Toast.show({ text: `Conectado a ${stored.name ?? stored.deviceId}` });
      return stored;
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

    const txid = await this.walletService.createAndBroadcastTx(toAddress, amount);
    const payload: BleTransferPayload = {
      txid,
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

  async sendTxWithFallback(amount: number, toAddress: string): Promise<void> {
    await this.init();

    const txHex = await this.walletService.signTx(toAddress, amount);

    let sent = false;

    try {
      if (!this.connectedDevice) {
        throw new Error('BLE no disponible');
      }

      const payload = this.hexToBytes(txHex);
      await BleClient.write(
        this.connectedDevice.deviceId,
        'TX_SERVICE',
        'TX_CHAR',
        new DataView(payload.buffer),
      );
      await Toast.show({ text: '🔵 Transacción enviada vía BLE' });
      sent = true;
    } catch (error) {
      try {
        await this.http
          .post(`${this.chronikUrl}/broadcast-tx`, { rawTx: txHex })
          .toPromise();
        await Toast.show({ text: '🌐 Transacción enviada vía Internet' });
        sent = true;
      } catch (err) {
        await Toast.show({ text: '❌ Error enviando transacción' });
        console.error(err);
      }
    }

    if (sent) {
      await this.txs.save({
        txid: txHex.slice(0, 24),
        amount,
        to: toAddress,
        time: Date.now() / 1000,
        confirmed: false,
      });
    }
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

  private storeDiscoveredDevice(device: BleDevice): BleDevice {
    const current = this.discoveredDevices.get(device.deviceId);
    const merged = {
      ...(current ?? {}),
      ...device,
    } as BleDevice;

    this.discoveredDevices.set(device.deviceId, merged);
    return merged;
  }

  private hexToBytes(hex: string): Uint8Array {
    const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
    const arr = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
      arr[i / 2] = parseInt(normalized.substring(i, i + 2), 16);
    }
    return arr;
  }
}

export { BLEService as BleService };
