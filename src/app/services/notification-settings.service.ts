import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationSettingsService {
  private settingsKey = 'rmz_notify_settings';
  private defaults = {
    ble: true,
    network: true,
    sound: true,
    visual: true
  };

  getSettings() {
    const stored = localStorage.getItem(this.settingsKey);
    return stored ? JSON.parse(stored) : this.defaults;
  }

  save(settings: any) {
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
  }

  toggle(key: keyof typeof this.defaults) {
    const current = this.getSettings();
    current[key] = !current[key];
    this.save(current);
  }
}
