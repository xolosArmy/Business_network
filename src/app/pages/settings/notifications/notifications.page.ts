import { Component, OnInit } from '@angular/core';
import { NotificationService } from 'src/app/services/notification.service';
import { NotificationSettingsService } from 'src/app/services/notification-settings.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage implements OnInit {
  settings: any = {};

  constructor(
    private notify: NotificationService,
    private settingsService: NotificationSettingsService
  ) {}

  ngOnInit() {
    this.settings = this.settingsService.getSettings();
  }

  save() {
    this.settingsService.save(this.settings);
  }

  testNotification() {
    this.notify.show('🔔 Prueba de notificación', 'Esta es una notificación de ejemplo.');
  }
}
