import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import type { BleDevice } from '@capacitor-community/bluetooth-le';

import { BleService } from '../../services/ble.service';

@Component({
  selector: 'app-status-bar',
  templateUrl: './status-bar.component.html',
  styleUrls: ['./status-bar.component.scss'],
})
export class StatusBarComponent implements OnInit, OnDestroy {
  isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  private removeConnectionListeners: (() => void) | null = null;

  constructor(
    private readonly zone: NgZone,
    public readonly bleService: BleService,
  ) {}

  ngOnInit(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const updateOnlineStatus = () => {
      this.zone.run(() => {
        this.isOnline = navigator.onLine;
      });
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    this.removeConnectionListeners = () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }

  ngOnDestroy(): void {
    this.removeConnectionListeners?.();
  }

  get internetIcon(): string {
    return this.isOnline ? 'wifi' : 'cloud-offline';
  }

  get bleIcon(): string {
    return this.bleService.connectedDevice ? 'bluetooth' : 'bluetooth-outline';
  }

  get bleConnected(): boolean {
    return !!this.bleService.connectedDevice;
  }

  get bleDevice(): string | null {
    const device = this.bleService.connectedDevice;
    if (!device) {
      return null;
    }

    const extendedDevice = device as BleDevice & { deviceName?: string };
    const name =
      extendedDevice?.name ||
      (typeof extendedDevice?.deviceName === 'string' ? extendedDevice.deviceName : undefined) ||
      'Unknown';
    return name && name.trim().length > 0 ? name : null;
  }
}
