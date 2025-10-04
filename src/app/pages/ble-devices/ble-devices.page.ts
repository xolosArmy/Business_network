import { Component, OnDestroy } from '@angular/core';
import type { BleDevice } from '@capacitor-community/bluetooth-le';
import { Toast } from '@capacitor/toast';

import { BleService } from '../../services/ble.service';

interface UiBleDevice {
  deviceId: string;
  name?: string | null;
  connected?: boolean;
  [key: string]: unknown;
}

@Component({
  selector: 'app-ble-devices',
  templateUrl: './ble-devices.page.html',
  styleUrls: ['./ble-devices.page.scss'],
})
export class BleDevicesPage implements OnDestroy {
  devices: UiBleDevice[] = [];
  connectedDevice: UiBleDevice | null = null;
  amount = 0;

  private discoveredDevices = new Map<string, UiBleDevice>();

  constructor(private readonly ble: BleService) {}

  ngOnDestroy(): void {
    this.devices = [];
    this.connectedDevice = null;
    this.discoveredDevices.clear();
    void this.ble.stop();
  }

  async scan(): Promise<void> {
    this.devices = [];
    this.connectedDevice = null;
    this.discoveredDevices.clear();

    await this.ble.init();
    await Toast.show({ text: 'Buscando dispositivos BLE...' });

    try {
      await this.ble.scanAndConnect({
        autoConnect: false,
        onDeviceDiscovered: (device) => {
          this.upsertDevice(device);
        },
      });
    } catch (error) {
      console.error('No fue posible iniciar el escaneo BLE.', error);
      await Toast.show({ text: 'No fue posible iniciar el escaneo BLE.' });
    }
  }

  async connect(device: UiBleDevice): Promise<void> {
    try {
      const connected = await this.ble.connect(device.deviceId);
      this.markConnected(connected);
    } catch (error) {
      console.error('No fue posible conectar con el dispositivo BLE.', error);
      await Toast.show({ text: 'No fue posible conectar con el dispositivo BLE.' });
    }
  }

  async send(): Promise<void> {
    if (!this.amount || !this.connectedDevice) {
      await Toast.show({ text: 'Introduce cantidad y selecciona un dispositivo' });
      return;
    }

    const target =
      (typeof this.connectedDevice.address === 'string' && this.connectedDevice.address.length > 0
        ? this.connectedDevice.address
        : this.connectedDevice.deviceId);

    try {
      await this.ble.sendTx(target, this.amount);
      await Toast.show({ text: 'Transacción enviada vía BLE.' });
    } catch (error) {
      console.error('No fue posible enviar la transacción vía BLE.', error);
      await Toast.show({ text: 'No fue posible enviar la transacción vía BLE.' });
    }
  }

  private upsertDevice(device: BleDevice): void {
    const existing = this.discoveredDevices.get(device.deviceId);
    const mapped: UiBleDevice = {
      ...existing,
      ...device,
      connected: existing?.connected ?? false,
    };
    this.discoveredDevices.set(device.deviceId, mapped);
    this.devices = Array.from(this.discoveredDevices.values());
  }

  private markConnected(device: BleDevice): void {
    const stored = this.discoveredDevices.get(device.deviceId) ?? {
      deviceId: device.deviceId,
      name: device.name,
    };

    const updated: UiBleDevice = {
      ...stored,
      ...device,
      connected: true,
    };

    this.discoveredDevices.set(device.deviceId, updated);

    for (const [id, value] of this.discoveredDevices.entries()) {
      if (id === device.deviceId) {
        continue;
      }
      this.discoveredDevices.set(id, { ...value, connected: false });
    }

    this.devices = Array.from(this.discoveredDevices.values());
    this.connectedDevice = updated;
  }
}
