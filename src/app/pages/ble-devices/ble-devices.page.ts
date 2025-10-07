import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { BluetoothLe } from '@capacitor-community/bluetooth-le';
import type { PluginListenerHandle } from '@capacitor/core';
import { Toast } from '@capacitor/toast';

interface BLEDevice {
  deviceId: string;
  name: string;
  rssi?: number;
  connected?: boolean;
}

@Component({
  selector: 'app-ble-devices',
  templateUrl: './ble-devices.page.html',
  styleUrls: ['./ble-devices.page.scss'],
})
export class BleDevicesPage implements OnInit, OnDestroy {
  devices: BLEDevice[] = [];
  connectedDevice: BLEDevice | null = null;
  scanning = false;
  connectionStatus = 'Desconectado';
  isSupported = true;

  private listeners: PluginListenerHandle[] = [];
  private scanTimeout?: ReturnType<typeof setTimeout>;

  constructor(private readonly zone: NgZone) {}

  async ngOnInit(): Promise<void> {
    await this.registerListeners();
    await this.checkPermissions();
    await this.restoreLastDevice();
  }

  ngOnDestroy(): void {
    void this.stopScan();
    for (const listener of this.listeners) {
      void listener.remove();
    }
    this.listeners = [];
  }

  async checkPermissions(): Promise<void> {
    if (!BluetoothLe?.requestLEScanPermissions) {
      this.isSupported = false;
      console.warn('BLE plugin no disponible en esta plataforma.');
      return;
    }

    try {
      await BluetoothLe.requestLEScanPermissions();
    } catch (error) {
      console.error('Error obteniendo permisos BLE:', error);
      await Toast.show({ text: 'No fue posible obtener permisos BLE.' });
    }
  }

  async restoreLastDevice(): Promise<void> {
    try {
      const saved = localStorage.getItem('rmz_ble_device');
      if (saved) {
        const device = JSON.parse(saved) as BLEDevice;
        this.connectedDevice = { ...device, connected: false };
        this.connectionStatus = 'Dispositivo recordado';
      }
    } catch (error) {
      console.warn('No fue posible restaurar el dispositivo BLE guardado.', error);
    }
  }

  async startScan(): Promise<void> {
    if (this.scanning) {
      return;
    }

    if (!this.isSupported) {
      await Toast.show({ text: 'BLE no es compatible en este dispositivo.' });
      return;
    }

    this.scanning = true;
    this.devices = this.connectedDevice
      ? [{ ...this.connectedDevice }]
      : [];

    try {
      await BluetoothLe.requestLEScan({}, (result) => {
        if (!result?.device) {
          return;
        }

        this.zone.run(() => {
          const mapped: BLEDevice = {
            deviceId: result.device.deviceId,
            name: result.device.name || 'Sin nombre',
            rssi: result.rssi ?? undefined,
          };

          const existingIndex = this.devices.findIndex(
            (d) => d.deviceId === mapped.deviceId,
          );

          if (existingIndex >= 0) {
            this.devices[existingIndex] = {
              ...this.devices[existingIndex],
              ...mapped,
            };
          } else {
            this.devices = [...this.devices, mapped];
          }
        });
      });

      this.scanTimeout = setTimeout(() => {
        void this.stopScan();
      }, 10000);

      await Toast.show({ text: 'Escaneando dispositivos BLE...' });
    } catch (error) {
      console.error('Error al escanear BLE:', error);
      this.zone.run(() => {
        this.scanning = false;
      });
      await Toast.show({ text: 'No fue posible escanear dispositivos BLE.' });
    }
  }

  async stopScan(): Promise<void> {
    if (!this.scanning) {
      return;
    }

    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = undefined;
    }

    try {
      await BluetoothLe.stopLEScan();
    } catch (error) {
      console.warn('El escaneo BLE ya se encontraba detenido.', error);
    }

    this.zone.run(() => {
      this.scanning = false;
    });
  }

  async connect(device: BLEDevice): Promise<void> {
    if (!device) {
      return;
    }

    if (!this.isSupported) {
      await Toast.show({ text: 'BLE no es compatible en este dispositivo.' });
      return;
    }

    await this.stopScan();

    this.connectionStatus = 'Conectando...';

    try {
      await BluetoothLe.connect({ deviceId: device.deviceId });
      this.zone.run(() => {
        let updated = this.devices.map((item) =>
          item.deviceId === device.deviceId
            ? { ...item, connected: true }
            : { ...item, connected: false },
        );

        if (!updated.some((item) => item.deviceId === device.deviceId)) {
          updated = [...updated, { ...device, connected: true }];
        }

        this.devices = updated;
        this.connectedDevice = { ...device, connected: true };
        this.connectionStatus = 'Conectado';
      });
      localStorage.setItem('rmz_ble_device', JSON.stringify(device));
      await Toast.show({ text: `Conectado a ${device.name}` });
    } catch (error) {
      console.error('Error al conectar BLE:', error);
      this.connectionStatus = 'Error de conexión';
      await Toast.show({ text: 'Error al conectar dispositivo BLE' });
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedDevice) {
      return;
    }

    if (!this.isSupported) {
      this.zone.run(() => {
        this.connectionStatus = 'Desconectado';
        this.connectedDevice = null;
      });
      localStorage.removeItem('rmz_ble_device');
      return;
    }

    const targetId = this.connectedDevice.deviceId;

    try {
      await BluetoothLe.disconnect({ deviceId: this.connectedDevice.deviceId });
      await Toast.show({ text: `Desconectado de ${this.connectedDevice.name}` });
    } catch (error) {
      console.error('Error al desconectar:', error);
    } finally {
      this.zone.run(() => {
        this.connectionStatus = 'Desconectado';
        this.connectedDevice = null;
        this.devices = this.devices.map((item) =>
          item.deviceId === targetId ? { ...item, connected: false } : item,
        );
      });
      localStorage.removeItem('rmz_ble_device');
    }
  }

  private async registerListeners(): Promise<void> {
    if (!BluetoothLe?.addListener) {
      return;
    }

    try {
      const connectedListener = await BluetoothLe.addListener(
        'onConnected',
        (event: { deviceId: string; name?: string }) => {
          this.zone.run(() => {
            const device =
              this.devices.find((item) => item.deviceId === event.deviceId) ??
              ({
                deviceId: event.deviceId,
                name: event.name || 'Sin nombre',
              } as BLEDevice);
            let updated = this.devices.map((item) =>
              item.deviceId === event.deviceId
                ? { ...item, connected: true }
                : { ...item, connected: false },
            );

            if (!updated.some((item) => item.deviceId === event.deviceId)) {
              updated = [...updated, { ...device, connected: true }];
            }

            this.devices = updated;
            this.connectedDevice = { ...device, connected: true };
            this.connectionStatus = 'Conectado';
            localStorage.setItem('rmz_ble_device', JSON.stringify(this.connectedDevice));
          });
        },
      );
      this.listeners.push(connectedListener);

      const disconnectedListener = await BluetoothLe.addListener(
        'onDisconnected',
        (event: { deviceId: string }) => {
          this.zone.run(() => {
            if (this.connectedDevice?.deviceId === event.deviceId) {
              this.connectedDevice = null;
              this.connectionStatus = 'Desconectado';
              localStorage.removeItem('rmz_ble_device');
            }
            this.devices = this.devices.map((item) =>
              item.deviceId === event.deviceId
                ? { ...item, connected: false }
                : item,
            );
          });
        },
      );
      this.listeners.push(disconnectedListener);
    } catch (error) {
      console.warn('No fue posible registrar los listeners BLE.', error);
    }
  }
}
