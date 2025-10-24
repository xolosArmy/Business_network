import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Toast } from '@capacitor/toast';

import { CarteraService, WalletInfo } from '../../services/cartera.service';
import { SaldoService } from '../../services/saldo.service';
import { EnviarService } from '../../services/enviar.service';
import { BleService } from '../../services/ble.service';
import { OfflineStorageService } from '../../services/offline-storage.service';
import { TokenBalanceService } from '../../services/token-balance.service';
import { RMZ_TOKEN_ID } from '../../services/chronik.constants';

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  wallet: WalletInfo | null = null;
  balance: number | null = null;
  isLoadingWallet = false;
  isCreatingWallet = false;
  isRefreshingBalance = false;
  isSendModalOpen = false;
  isSending = false;
  isSendingToken = false;
  errorMessage = '';
  sendErrorMessage = '';
  rmzSendErrorMessage = '';
  isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  readonly sendForm: FormGroup;
  readonly rmzSendForm: FormGroup;
  readonly rmzTokenId = RMZ_TOKEN_ID;

  rmzTokenBalance: bigint | null = null;

  private removeConnectionListeners: (() => void) | null = null;

  constructor(
    private readonly carteraService: CarteraService,
    private readonly saldoService: SaldoService,
    private readonly enviarService: EnviarService,
    private readonly offlineStorage: OfflineStorageService,
    private readonly tokenBalanceService: TokenBalanceService,
    private readonly ngZone: NgZone,
    public readonly ble: BleService,
    formBuilder: FormBuilder,
  ) {
    this.sendForm = formBuilder.group({
      destination: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(0.000001)]],
    });

    this.rmzSendForm = formBuilder.group({
      tokenDestination: ['', Validators.required],
      tokenAmount: [null, [Validators.required, Validators.min(1)]],
    });

    this.registerConnectionListeners();
  }

  async ngOnInit(): Promise<void> {
    await this.loadWallet();
  }

  ngOnDestroy(): void {
    this.removeConnectionListeners?.();
  }

  get hasWallet(): boolean {
    return !!this.wallet?.address;
  }

  get formattedBalance(): string {
    if (this.balance === null) {
      return '--';
    }

    return `${this.saldoService.formatBalance(this.balance)} XEC`;
  }

  get formattedRmzBalance(): string {
    if (this.rmzTokenBalance === null) {
      return '-- RMZ';
    }

    return `${this.rmzTokenBalance.toString()} RMZ`;
  }

  async loadWallet(): Promise<void> {
    this.isLoadingWallet = true;
    this.errorMessage = '';

    try {
      this.wallet = await this.carteraService.getWalletInfo();
      if (this.wallet?.address) {
        await this.refreshBalance();
      } else {
        this.balance = null;
        this.rmzTokenBalance = null;
        await this.loadCachedBalance();
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
      this.wallet = await this.carteraService.createWallet();
      await this.refreshBalance();
      await Toast.show({ text: 'Cartera creada correctamente.' });
    } catch (error) {
      this.errorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isCreatingWallet = false;
    }
  }

  async refreshBalance(): Promise<void> {
    if (!this.wallet?.mnemonic) {
      await this.loadCachedBalance();
      this.rmzTokenBalance = null;
      return;
    }

    this.isRefreshingBalance = true;
    this.errorMessage = '';

    try {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;

      if (!online) {
        const cachedBalance = await this.offlineStorage.getCachedBalance();
        if (cachedBalance === null) {
          throw new Error('Sin conexión y sin saldo almacenado localmente.');
        }
        this.balance = cachedBalance;
        this.rmzTokenBalance = null;
        return;
      }

      const address = this.wallet?.address ?? '';
      if (!address) {
        this.balance = 0;
        await this.offlineStorage.setCachedBalance(0);
        this.rmzTokenBalance = null;
        return;
      }

      const [xecBalance, rmzBalance] = await Promise.all([
        this.saldoService.getBalance(address),
        this.fetchRmzTokenBalance(address),
      ]);

      this.balance = xecBalance;
      this.rmzTokenBalance = rmzBalance;
      await this.offlineStorage.setCachedBalance(this.balance ?? 0);
    } catch (error) {
      const cachedBalance = await this.offlineStorage.getCachedBalance();
      if (cachedBalance !== null) {
        this.balance = cachedBalance;
        this.errorMessage = `${this.resolveErrorMessage(error)}. Mostrando saldo almacenado.`;
      } else {
        this.errorMessage = this.resolveErrorMessage(error);
      }
      this.rmzTokenBalance = null;
    } finally {
      this.isRefreshingBalance = false;
    }
  }

  openSendModal(): void {
    this.sendForm.reset({ destination: '', amount: null });
    this.sendErrorMessage = '';
    this.rmzSendForm.reset({ tokenDestination: '', tokenAmount: null });
    this.rmzSendErrorMessage = '';
    this.isSendModalOpen = true;
  }

  closeSendModal(): void {
    this.isSendModalOpen = false;
    this.isSendingToken = false;
  }

  async onSubmitSend(): Promise<void> {
    if (!this.wallet?.mnemonic) {
      this.sendErrorMessage = 'Debes crear una cartera antes de enviar fondos.';
      return;
    }

    if (this.sendForm.invalid) {
      this.sendForm.markAllAsTouched();
      return;
    }

    const destination = String(this.sendForm.value.destination ?? '').trim();
    const amount = Number(this.sendForm.value.amount);

    if (!destination) {
      this.sendErrorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      this.sendErrorMessage = 'El monto debe ser mayor que cero.';
      return;
    }

    this.isSending = true;
    this.sendErrorMessage = '';

    try {
      const txid = await this.enviarService.sendTransaction(
        { mnemonic: this.wallet.mnemonic, address: this.wallet.address },
        destination,
        amount,
      );
      const isPending = txid.startsWith('pending-offline-');
      const toastMessage = isPending
        ? 'Transacción guardada para envío cuando regreses a internet.'
        : `Transacción enviada: ${txid}`;
      await Toast.show({ text: toastMessage });
      this.closeSendModal();
      await this.refreshBalance();
    } catch (error) {
      this.sendErrorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isSending = false;
    }
  }

  async onSubmitSendToken(): Promise<void> {
    if (!this.wallet?.mnemonic) {
      this.rmzSendErrorMessage = 'Debes crear una cartera antes de enviar eTokens.';
      return;
    }

    if (this.rmzSendForm.invalid) {
      this.rmzSendForm.markAllAsTouched();
      return;
    }

    const destination = String(this.rmzSendForm.value.tokenDestination ?? '').trim();
    const amount = Number(this.rmzSendForm.value.tokenAmount);

    if (!destination) {
      this.rmzSendErrorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      this.rmzSendErrorMessage = 'El monto del eToken debe ser un número entero mayor que cero.';
      return;
    }

    this.isSendingToken = true;
    this.rmzSendErrorMessage = '';

    try {
      const result = await this.carteraService.sendRMZToken(destination, amount);
      await Toast.show({ text: `eToken enviado: ${result.txid}` });
      this.rmzSendForm.reset({ tokenDestination: '', tokenAmount: null });
      await this.refreshBalance();
    } catch (error) {
      this.rmzSendErrorMessage = this.resolveErrorMessage(error);
    } finally {
      this.isSendingToken = false;
    }
  }

  private async fetchRmzTokenBalance(address: string): Promise<bigint | null> {
    try {
      return await this.tokenBalanceService.getRMZBalance(address);
    } catch (error) {
      console.warn('No se pudo obtener el saldo del token RMZ.', error);
      return null;
    }
  }

  private async loadCachedBalance(): Promise<void> {
    const cachedBalance = await this.offlineStorage.getCachedBalance();
    if (cachedBalance !== null) {
      this.balance = cachedBalance;
    }
  }

  private registerConnectionListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const onlineHandler = () =>
      this.ngZone.run(() => {
        this.isOnline = true;
        void this.refreshBalance();
      });

    const offlineHandler = () =>
      this.ngZone.run(() => {
        this.isOnline = false;
        void this.loadCachedBalance();
      });

    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);

    this.removeConnectionListeners = () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error ?? 'Ocurrió un error desconocido.');
  }
}
