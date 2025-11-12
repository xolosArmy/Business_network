import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';
import { ToastController } from '@ionic/angular';

import { WalletService } from '../../services/wallet.service';
import { TransactionsService } from '../../services/transactions.service';
import { SyncService, type SyncStatus } from '../../services/sync.service';
import { CarteraService } from '../../services/cartera.service';

type Section = 'overview' | 'send' | 'receive';

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  readonly state$ = this.walletService.state$;
  readonly transactions$ = this.transactionsService.transactions$;
  readonly syncStatus$ = this.syncService.status$;

  currentSection: Section = 'overview';
  sendToAddress = '';
  sendAmount: number | null = null;
  selectedAsset: 'XEC' | 'RMZ' = 'XEC';
  statusMessage = '';
  qrDataUrl: string | null = null;
  showInlineQr = false;

  private readonly syncLabels: Record<SyncStatus, string> = {
    idle: 'Esperando sincronización',
    syncing: 'Sincronizando…',
    synced: 'Sincronizado',
    disconnected: 'Sin conexión',
  };
  private currentAddress: string | null = null;
  private subscriptions: Subscription[] = [];

  constructor(
    public readonly walletService: WalletService,
    private readonly transactionsService: TransactionsService,
    private readonly syncService: SyncService,
    private readonly carteraService: CarteraService,
    private readonly toastController: ToastController,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.walletService.initWallet();
    this.subscriptions.push(
      this.state$.subscribe((state) => {
        const nextAddress = state.address ?? null;
        if (nextAddress && nextAddress !== this.currentAddress) {
          this.currentAddress = nextAddress;
          void this.transactionsService.refreshHistory(nextAddress);
          void this.buildQrCode(nextAddress);
          this.showInlineQr = false;
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async setSection(section: Section): Promise<void> {
    this.currentSection = section;
    if (section === 'receive' && this.currentAddress) {
      await this.buildQrCode(this.currentAddress);
    }
  }

  async sendPayment(): Promise<void> {
    if (!this.sendToAddress?.trim() || !this.sendAmount || this.sendAmount <= 0) {
      this.statusMessage = '⚠️ Completa dirección y monto para continuar.';
      return;
    }

    if (!this.currentAddress) {
      this.statusMessage = '⚠️ Aún no hay una cartera activa. Crea o importa una antes de enviar.';
      return;
    }

    try {
      const destination = this.sendToAddress.trim();
      const amount = this.sendAmount;
      let txid: string;

      if (this.selectedAsset === 'XEC') {
        txid = await this.walletService.sendXec(destination, amount);
      } else {
        const result = await this.carteraService.sendRMZToken(destination, amount);
        if (!result?.txid) {
          const fallbackMessage = '❌ Envío de eToken fallido.';
          this.statusMessage = fallbackMessage;
          await this.presentToast(fallbackMessage, 'danger');
          return;
        }
        txid = result.txid;
        await this.presentToast(`✅ eToken enviado. TXID: ${txid}`, 'success');
      }

      this.statusMessage = `✅ Enviado. TXID: ${txid}`;
      this.sendToAddress = '';
      this.sendAmount = null;
      await this.transactionsService.refreshHistory(this.currentAddress ?? destination);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `❌ Error al enviar: ${message}`;
    }
  }

  async copyAddress(address?: string | null): Promise<void> {
    const target = address ?? this.currentAddress;
    if (!target) {
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(target);
      }
      this.statusMessage = '📋 Dirección copiada.';
    } catch (error) {
      console.error('No se pudo copiar la dirección', error);
      this.statusMessage = '❌ No se pudo copiar la dirección.';
    }
  }

  async toggleInlineQr(): Promise<void> {
    if (!this.currentAddress) {
      this.showInlineQr = false;
      return;
    }

    if (!this.qrDataUrl) {
      await this.buildQrCode(this.currentAddress);
    }

    this.showInlineQr = !this.showInlineQr;
  }

  async refreshHistory(): Promise<void> {
    if (this.currentAddress) {
      await this.transactionsService.refreshHistory(this.currentAddress);
    }
  }

  trackTx(_index: number, item: { txid: string }): string {
    return item.txid;
  }

  statusText(status: SyncStatus | null): string {
    if (!status) {
      return this.syncLabels.idle;
    }
    return this.syncLabels[status];
  }

  private async buildQrCode(address: string): Promise<void> {
    try {
      this.qrDataUrl = await QRCode.toDataURL(address);
    } catch (error) {
      console.warn('No se pudo generar el QR', error);
      this.qrDataUrl = null;
    }
  }

  async createNewWallet(): Promise<void> {
    try {
      const state = await this.walletService.createWallet();
      this.currentAddress = state.address ?? null;
      if (this.currentAddress) {
        void this.transactionsService.refreshHistory(this.currentAddress);
        void this.buildQrCode(this.currentAddress);
        this.statusMessage = '✅ Nueva cartera creada con éxito.';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `❌ No se pudo crear la cartera: ${message}`;
      await this.presentToast(this.statusMessage, 'danger');
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'medium' = 'medium'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
