import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Configuración</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list inset="true">
        <ion-item routerLink="notifications" detail>
          <ion-label>
            <h2>Notificaciones</h2>
            <p>Personaliza cómo y cuándo recibir avisos de la aplicación.</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <p class="ion-text-center ion-margin-top ion-text-wrap">
        Muy pronto encontrarás más opciones para adaptar RMZ Wallet a tus necesidades.
      </p>
    </ion-content>
  `,
})
export class SettingsPage {}
