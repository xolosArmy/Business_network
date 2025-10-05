import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private audioCtx?: AudioContext;

  constructor() {
    // Evitar errores en SSR y solo inicializar en el navegador
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioCtx = new (window.AudioContext as any)();
    }
  }

  /**
   * Reproduce un beep corto SIN usar archivos de audio.
   * Usa Web Audio API (Oscillator + Gain).
   */
  play(durationMs: number = 140, frequency: number = 880, volume: number = 0.06) {
    try {
      if (!this.audioCtx) {
        return;
      }

      const ctx = this.audioCtx;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      // Volumen inicial bajo y pequeño envelope para evitar clicks
      const now = ctx.currentTime;
      const attack = 0.005;
      const release = 0.08;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.setTargetAtTime(0, now + attack + durationMs / 1000, release);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + durationMs / 1000 + release);
    } catch (err) {
      console.warn('No se pudo reproducir el beep:', err);
    }
  }

  /**
   * Solicita permiso para notificaciones (si aplica).
   */
  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'default') {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  }

  /**
   * Indica si podemos mostrar notificaciones nativas.
   */
  canNotify(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    );
  }

  /**
   * Muestra una notificación nativa (si hay permisos) y reproduce un beep.
   * Puedes pasar opciones extra compatibles con NotificationOptions.
   */
  async show(title: string, body: string, options: NotificationOptions = {}) {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(title, {
            body,
            // icon opcional; si no quieres usar binarios, omite o usa un emoji en el title/body
            // icon: 'assets/icons/icon-192x192.png',
            ...options
          });
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            new Notification(title, {
              body,
              // icon: 'assets/icons/icon-192x192.png',
              ...options
            });
          }
        }
      }

      // Hacer vibrar (si está disponible) y reproducir beep sin binarios
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(60);
      }
      this.play();
    } catch (err) {
      console.warn('No se pudo mostrar la notificación:', err);
      // Aun si falla, intenta beep como feedback
      this.play();
    }
  }
}
