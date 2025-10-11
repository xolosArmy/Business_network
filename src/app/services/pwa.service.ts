import { Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

@Injectable({ providedIn: 'root' })
export class PwaService {
  private deferredPrompt?: BeforeInstallPromptEvent;

  constructor(private readonly updates: SwUpdate) {
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
    });

    window.addEventListener('appinstalled', () => {
      console.log('📲 RMZ Wallet instalada como PWA');
      this.deferredPrompt = undefined;
    });
  }

  init(): void {
    if (!this.updates.isEnabled) {
      return;
    }

    this.updates.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe((event: VersionReadyEvent) => {
        console.log('🔁 Actualización de PWA disponible', event);
        void this.promptForUpdate();
      });

    void this.updates.checkForUpdate();
  }

  async showInstallPrompt(): Promise<void> {
    if (!this.deferredPrompt) {
      return;
    }

    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log('PWA install:', outcome);
    this.deferredPrompt = undefined;
  }

  private async promptForUpdate(): Promise<void> {
    const shouldReload = window.confirm(
      'Hay una nueva versión de RMZ Wallet disponible. ¿Deseas actualizar ahora?',
    );

    if (shouldReload) {
      try {
        await this.updates.activateUpdate();
        document.location.reload();
      } catch (error) {
        console.error('❌ Error aplicando actualización PWA:', error);
      }
    }
  }
}
