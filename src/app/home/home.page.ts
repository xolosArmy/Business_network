import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Toast } from '@capacitor/toast';

import { WalletService, WalletSnapshot } from '../services/wallet.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit {
  wallet: WalletSnapshot | null = null;
  balance: number | null = null;
  isLoadingWallet = false;
  isCreatingWallet = false;
  isRefreshingBalance = false;
  isSendModalOpen = false;
  isSending = false;
  errorMessage = '';

  readonly sendForm: FormGroup;

  constructor(
    private readonly walletService: WalletService,
    formBuilder: FormBuilder,
  ) {
    this.sendForm = formBuilder.group({
      destination: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(0.000001)]],
    });

    const service = this.walletService as WalletService & {
      sendTx?: (destination: string, amount: number) => Promise<string>;
      send?: (destination: string, amount: number) => Promise<string>;
    };

    if (typeof service.sendTx !== 'function' && typeof service.send === 'function') {
      service.sendTx = service.send.bind(this.walletService);
    }
  }

  async ngOnInit(): Promise<void> {
    await this.loadWallet();
  }

  get hasWallet(): boolean {
    return !!this.wallet?.address;
  }

  get formattedBalance(): string {
    if (this.balance === null || Number.isNaN(this.balance)) {
      return '--';
    }

    return `${this.balance.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })} XEC`;
  }

  async loadWallet(): Promise<void> {
    this.isLoadingWallet = true;
    this.errorMessage = '';

    try {
      this.wallet = await this.walletService.loadWallet();
      if (this.wallet) {
        await this.refreshBalance();
      } else {
        this.balance = null;
      }
    } catch (error) {
      this.errorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isLoadingWallet = false;
    }
  }

  async onCreateWallet(): Promise<void> {
    this.isCreatingWallet = true;
    this.errorMessage = '';

    try {
      this.wallet = await this.walletService.createWallet();
      await this.refreshBalance();
      await Toast.show({ text: 'Cartera creada correctamente.' });
    } catch (error) {
      this.errorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isCreatingWallet = false;
    }
  }

  async refreshBalance(): Promise<void> {
    if (!this.wallet?.address) {
      return;
    }

    this.isRefreshingBalance = true;
    this.errorMessage = '';

    try {
      this.balance = await this.walletService.getBalance();
    } catch (error) {
      this.errorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isRefreshingBalance = false;
    }
  }

  openSendModal(): void {
    this.sendForm.reset({ destination: '', amount: null });
    this.isSendModalOpen = true;
  }

  closeSendModal(): void {
    this.isSendModalOpen = false;
  }

  async onSubmitSend(): Promise<void> {
    if (!this.wallet?.address) {
      this.errorMessage = 'Debes crear una cartera antes de enviar fondos.';
      return;
    }

    if (this.sendForm.invalid) {
      this.sendForm.markAllAsTouched();
      return;
    }

    const destination = String(this.sendForm.value.destination ?? '').trim();
    const amount = Number(this.sendForm.value.amount);

    if (!destination) {
      this.errorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      this.errorMessage = 'El monto debe ser mayor que cero.';
      return;
    }

    this.isSending = true;
    this.errorMessage = '';

    try {
      const service = this.walletService as WalletService & {
        sendTx: (destination: string, amount: number) => Promise<string>;
      };
      const txid = await service.sendTx(destination, amount);
      await Toast.show({ text: `Transacción enviada: ${txid}` });
      this.closeSendModal();
      await this.refreshBalance();
    } catch (error) {
      this.errorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isSending = false;
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error ?? 'Ocurrió un error desconocido.');
  }
}
