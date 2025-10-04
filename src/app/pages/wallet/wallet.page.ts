import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CarteraService, WalletInfo } from '../../services/cartera.service';
import { SaldoService } from '../../services/saldo.service';
import { EnviarService } from '../../services/enviar.service';
import { BleService } from '../../services/ble.service';

@Component({
  selector: 'app-wallet',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Mi Cartera</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card *ngIf="wallet">
        <ion-card-header>
          <ion-card-title>Información de la cartera</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p class="wallet-label">Dirección pública</p>
          <ion-item lines="none">
            <ion-label class="address-label">{{ wallet?.address }}</ion-label>
          </ion-item>

          <p class="wallet-label">Balance disponible</p>
          <ion-item lines="none">
            <ion-label>{{ balanceLabel }}</ion-label>
          </ion-item>

          <ion-button
            expand="block"
            color="primary"
            (click)="toggleQr()"
            [disabled]="!wallet?.address"
          >
            {{ showQr ? 'Ocultar' : 'Recibir' }}
          </ion-button>

          <div *ngIf="showQr" class="qr-wrapper">
            <img
              *ngIf="qrImageSrc; else qrFallback"
              class="qr-image"
              [src]="qrImageSrc"
              alt="Código QR de la dirección"
            />
            <ng-template #qrFallback>
              <p>No se pudo generar el código QR.</p>
            </ng-template>
          </div>

          <ion-button
            expand="block"
            color="secondary"
            (click)="advertiseWallet()"
            [disabled]="!wallet?.address"
          >
            Anunciar Wallet
          </ion-button>

          <ion-button expand="block" (click)="scanForPeers()">
            Buscar Peers
          </ion-button>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Enviar</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <form [formGroup]="sendForm" (ngSubmit)="onSubmit()">
            <ion-item>
              <ion-label position="floating">Dirección destino</ion-label>
              <ion-input formControlName="toAddress" required></ion-input>
            </ion-item>
            <ion-item>
              <ion-label position="floating">Cantidad (XEC)</ion-label>
              <ion-input
                type="number"
                min="0"
                step="0.01"
                formControlName="amount"
                required
              ></ion-input>
            </ion-item>

            <ion-button
              expand="block"
              type="submit"
              [disabled]="sendForm.invalid || sending"
            >
              {{ sending ? 'Enviando…' : 'Enviar' }}
            </ion-button>

            <ion-button
              expand="block"
              type="button"
              color="tertiary"
              (click)="sendBle()"
              [disabled]="sendForm.invalid || sending"
            >
              Enviar vía BLE
            </ion-button>
          </form>

          <ion-item *ngIf="errorMessage" lines="none">
            <ion-label color="danger">{{ errorMessage }}</ion-label>
          </ion-item>

          <ion-item *ngIf="successMessage" lines="none">
            <ion-label color="success">{{ successMessage }}</ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [
    `
      .wallet-label {
        font-weight: 600;
        margin-top: 0.5rem;
      }
      .address-label {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .qr-wrapper {
        margin-top: 1rem;
        display: flex;
        justify-content: center;
      }
      .qr-image {
        width: 200px;
        height: 200px;
      }
    `,
  ],
})
export class WalletPage implements OnInit, OnDestroy {
  wallet: WalletInfo | null = null;
  balanceLabel = '0.00';
  showQr = false;
  qrImageSrc: string | null = null;
  sendForm: FormGroup;
  sending = false;
  errorMessage = '';
  successMessage = '';
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly carteraService: CarteraService,
    private readonly saldoService: SaldoService,
    private readonly enviarService: EnviarService,
    private readonly ble: BleService,
    private readonly formBuilder: FormBuilder,
  ) {
    this.sendForm = this.formBuilder.group({
      toAddress: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(0.01)]],
    });
  }

  ngOnInit(): void {
    this.loadWalletInfo();
    const sub = this.sendForm.valueChanges.subscribe(() => {
      this.errorMessage = '';
      this.successMessage = '';
    });
    this.subscriptions.push(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadWalletInfo(): Promise<void> {
    this.wallet = await this.carteraService.getWalletInfo();
    if (this.wallet) {
      await this.refreshBalance(this.wallet);
      if (this.wallet.address) {
        this.updateQrImage(this.wallet.address);
      }
    }
  }

  async refreshBalance(wallet: WalletInfo): Promise<void> {
    try {
      const balance = await this.saldoService.getBalance(wallet);
      this.balanceLabel = this.saldoService.formatBalance(balance);
    } catch (error) {
      this.balanceLabel = '0.00';
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  toggleQr(): void {
    this.showQr = !this.showQr;
    if (this.showQr && this.wallet?.address) {
      this.updateQrImage(this.wallet.address);
    }
  }

  private updateQrImage(address: string): void {
    const encoded = encodeURIComponent(address);
    this.qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
  }

  async onSubmit(): Promise<void> {
    if (!this.wallet) {
      this.errorMessage = 'No hay una cartera disponible.';
      return;
    }
    if (this.sendForm.invalid) {
      this.errorMessage = 'Complete los campos requeridos.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.sending = true;

    const { toAddress, amount } = this.sendForm.value;

    try {
      const parsedAmount = typeof amount === 'string' ? Number(amount) : amount;
      const numericAmount = Number(parsedAmount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Monto inválido.');
      }
      const txid = await this.enviarService.sendTransaction(
        this.wallet,
        String(toAddress).trim(),
        numericAmount,
      );
      this.successMessage = `Transacción enviada. TXID: ${txid}`;
      this.sendForm.reset();
      if (this.wallet) {
        await this.refreshBalance(this.wallet);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.sending = false;
    }
  }

  async advertiseWallet(): Promise<void> {
    if (!this.wallet?.address) {
      this.errorMessage = 'No hay una dirección disponible para anunciar.';
      return;
    }

    try {
      await this.ble.advertise(this.wallet.address);
      this.successMessage = 'Wallet anunciada vía BLE.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async scanForPeers(): Promise<void> {
    try {
      await this.ble.scanAndConnect();
      this.successMessage = 'Escaneando dispositivos BLE cercanos…';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async sendBle(): Promise<void> {
    if (this.sendForm.invalid) {
      this.errorMessage = 'Complete los campos requeridos.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.sending = true;

    const { toAddress, amount } = this.sendForm.value;

    try {
      const parsedAmount = typeof amount === 'string' ? Number(amount) : amount;
      const numericAmount = Number(parsedAmount);

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Monto inválido.');
      }

      await this.ble.sendTx(String(toAddress).trim(), numericAmount);
      this.successMessage = 'Transacción enviada vía BLE.';
      this.sendForm.reset();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.sending = false;
    }
  }
}
