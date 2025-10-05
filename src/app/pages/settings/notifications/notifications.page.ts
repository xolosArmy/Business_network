import { Component } from '@angular/core';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage {
  public readonly notificationOptions = [
    {
      title: 'Alertas de transacciones',
      description:
        'Recibe avisos cuando se acrediten o debiten fondos de tu billetera.',
    },
    {
      title: 'Recordatorios',
      description:
        'Mantente al día con recordatorios para tareas importantes dentro de la app.',
    },
    {
      title: 'Novedades del producto',
      description:
        'Sé la primera persona en enterarte sobre nuevas funciones y mejoras.',
    },
  ];
}
