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
      <p>
        Aquí podrás personalizar la aplicación. Por ahora este es un texto placeholder
        mientras definimos las opciones de configuración.
      </p>
    </ion-content>
  `,
})
export class SettingsPage {}
