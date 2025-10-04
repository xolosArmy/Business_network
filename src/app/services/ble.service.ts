import { Injectable } from '@angular/core';
import * as bleno from '@abandonware/bleno';

@Injectable({ providedIn: 'root' })
export class BleService {
  constructor() {
    this.init();
  }

  async init() {
    bleno.on('stateChange', (state) => {
      console.log('BLE State:', state);
      if (state === 'poweredOn') {
        bleno.startAdvertising('RMZWallet', ['1234']);
      } else {
        bleno.stopAdvertising();
      }
    });
  }
}
