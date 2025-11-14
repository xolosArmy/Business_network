import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

import { ChronikService, type ChronikConnectionState } from './chronik.service';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly statusSubject = new BehaviorSubject<SyncStatus>('idle');
  readonly status$ = this.statusSubject.asObservable();

  constructor(private readonly chronikService: ChronikService) {
    this.chronikService.connectionState$.subscribe((state) => {
      this.statusSubject.next(this.mapState(state));
    });
  }

  listenForNetwork(): void {
    Network.addListener('networkStatusChange', (status) => {
      if (!status.connected) {
        this.statusSubject.next('disconnected');
      } else {
        const current = this.chronikService.connectionState$.value;
        this.statusSubject.next(this.mapState(current));
      }
    });
  }

  private mapState(state: ChronikConnectionState): SyncStatus {
    switch (state) {
      case 'connected':
        return 'synced';
      case 'connecting':
        return 'syncing';
      case 'disconnected':
        return 'disconnected';
      default:
        return 'idle';
    }
  }
}
