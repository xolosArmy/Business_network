import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadChildren: () =>
          import('../home/home.module').then((m) => m.HomePageModule),
      },
      {
        path: 'wallet',
        loadChildren: () =>
          import('../wallet/wallet.module').then((m) => m.WalletPageModule),
      },
      {
        path: 'transactions',
        loadChildren: () =>
          import('../transactions/transactions.module').then(
            (m) => m.TransactionsPageModule,
          ),
      },
      {
        path: 'settings',
        children: [
          {
            path: '',
            loadChildren: () =>
              import('../settings/settings.module').then((m) => m.SettingsPageModule),
          },
          {
            path: 'notifications',
            loadChildren: () =>
              import('../settings/notifications/notifications.module').then(
                (m) => m.NotificationsPageModule,
              ),
          },
        ],
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabsPageRoutingModule {}
