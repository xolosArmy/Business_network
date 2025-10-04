import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { BleDevicesPage } from './ble-devices.page';

@NgModule({
  imports: [CommonModule, IonicModule, FormsModule, RouterModule.forChild([{ path: '', component: BleDevicesPage }])],
  declarations: [BleDevicesPage],
})
export class BleDevicesPageModule {}
