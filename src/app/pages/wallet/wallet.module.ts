import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { WalletPage } from './wallet.page';

const routes: Routes = [
  {
    path: '',
    component: WalletPage,
  },
];

@NgModule({
  imports: [CommonModule, IonicModule, ReactiveFormsModule, RouterModule.forChild(routes)],
  declarations: [WalletPage],
})
export class WalletPageModule {}
