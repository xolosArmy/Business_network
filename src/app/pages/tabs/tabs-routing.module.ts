import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'wallet',
        loadChildren: () =>
          import('../home/home.module').then((m) => m.HomePageModule),
      },
      {
        path: 'home',
        redirectTo: 'wallet',
        pathMatch: 'full',
      },
      {
        path: 'transactions',
        loadChildren: () =>
          import('../transactions/transactions.module').then(
            (m) => m.TransactionsPageModule,
          ),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('../settings/notifications/notifications.module').then(
            (m) => m.NotificationsPageModule,
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
        redirectTo: 'wallet',
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
