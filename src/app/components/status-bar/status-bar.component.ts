import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import type { BleDevice } from '@capacitor-community/bluetooth-le';

import { BleService } from '../../services/ble.service';
import { SyncService, type SyncStatus } from '../../services/sync.service';

@Component({
  selector: 'app-status-bar',
  templateUrl: './status-bar.component.html',
  styleUrls: ['./status-bar.component.scss'],
})
export class StatusBarComponent implements OnInit, OnDestroy {
  isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  syncStatus: SyncStatus = 'idle';

  private removeConnectionListeners: (() => void) | null = null;
  private syncSub?: Subscription;

  constructor(
    private readonly zone: NgZone,
    public readonly bleService: BleService,
    private readonly syncService: SyncService,
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

    this.syncSub = this.syncService.status$.subscribe((status) => {
      this.zone.run(() => {
        this.syncStatus = status;
      });
    });
  }

  ngOnDestroy(): void {
    this.removeConnectionListeners?.();
    this.syncSub?.unsubscribe();
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

  get chronikIcon(): string {
    return this.syncStatus === 'synced' ? 'radio-outline' : 'alert-circle-outline';
  }

  get chronikText(): string {
    switch (this.syncStatus) {
      case 'synced':
        return 'Chronik ok';
      case 'syncing':
        return 'Sincronizando…';
      case 'disconnected':
        return 'Chronik offline';
      default:
        return 'WS inactivo';
    }
  }
}
