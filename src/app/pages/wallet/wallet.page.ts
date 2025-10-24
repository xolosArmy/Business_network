import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Wallet } from 'ecash-wallet';
import * as QRCode from 'qrcode';

import { BleService } from '../../services/ble.service';
import { EnviarService } from '../../services/enviar.service';
import { WalletService } from '../../services/wallet.service';
import { CarteraService } from '../../services/cartera.service';
import { TokenBalanceService } from '../../services/token-balance.service';
import { RMZ_TOKEN_ID } from '../../services/chronik.constants';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage implements OnInit {
  address = '';
  wallet: Wallet | null = null;
  balanceLabel = '0 XEC';
  showQr = false;
  qrImageSrc: string | null = null;
  toAddr = '';
  amount: number | null = null;
  sending = false;
  sendingToken = false;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  sendForm: FormGroup;
  sendTokenForm: FormGroup;
  bleAvailable = false;
  tokenErrorMessage = '';
  rmzTokenBalance: bigint | null = null;
  readonly rmzTokenId = RMZ_TOKEN_ID;

  constructor(
    private readonly walletService: WalletService,
    private readonly enviarService: EnviarService,
    private readonly carteraService: CarteraService,
    private readonly tokenBalanceService: TokenBalanceService,
    private readonly bleService: BleService,
    formBuilder: FormBuilder,
  ) {
    this.sendForm = formBuilder.group({
      toAddr: ['', [Validators.required]],
      amount: [null, [Validators.required, Validators.min(0.000001)]],
    });
    this.sendTokenForm = formBuilder.group({
      tokenDestination: ['', [Validators.required]],
      tokenAmount: [null, [Validators.required, Validators.min(1)]]
    });
    this.bleAvailable = !!this.bleService;
  }

  async ngOnInit(): Promise<void> {
    await this.initWallet();
  }

  async initWallet(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      const mnemonic = localStorage.getItem('rmz_mnemonic');
      if (!mnemonic) {
        this.errorMessage = 'No hay semilla guardada.';
        this.rmzTokenBalance = null;
        return;
      }

      this.wallet = await this.walletService.loadFromMnemonic(mnemonic);
      const addr = this.walletService.getAddress();
      this.address = addr;
      await this.refreshBalance(addr);
      await this.generateQr();
    } catch (error) {
      console.error('Error al inicializar la cartera.', error);
      this.errorMessage = 'Error al inicializar la cartera.';
    } finally {
      this.isLoading = false;
    }
  }

  async toggleQr(): Promise<void> {
    this.showQr = !this.showQr;

    if (!this.showQr) {
      this.qrImageSrc = null;
      return;
    }

    await this.generateQr();
  }

  async onSubmit(): Promise<void> {
    if (this.sendForm.invalid) {
      this.sendForm.markAllAsTouched();
      return;
    }

    const destination = String(this.sendForm.value.toAddr ?? '').trim();
    const amountXec = Number(this.sendForm.value.amount);

    this.toAddr = destination;
    this.amount = Number.isFinite(amountXec) ? amountXec : null;

    if (!destination) {
      this.errorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isFinite(amountXec) || amountXec <= 0) {
      this.errorMessage = 'El monto debe ser mayor que cero.';
      return;
    }

    const amountInSats = Math.round(amountXec * 100);

    try {
      this.sending = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.tokenErrorMessage = '';

      const result = await this.enviarService.enviarTx(destination, amountInSats);
      if (result.success) {
        this.successMessage = `Transacción enviada ✅ TXID: ${result.txid}`;
        await this.refreshBalance();
        this.sendForm.reset();
        this.toAddr = '';
        this.amount = null;
      } else {
        this.errorMessage = result.error ?? 'No se pudo enviar la transacción.';
      }
    } catch (error) {
      console.error('Error al enviar transacción.', error);
      this.errorMessage = this.resolveErrorMessage(error);
    } finally {
      this.sending = false;
    }
  }

  async onSubmitToken(): Promise<void> {
    if (this.sendTokenForm.invalid) {
      this.sendTokenForm.markAllAsTouched();
      return;
    }

    const destination = String(this.sendTokenForm.value.tokenDestination ?? '').trim();
    const amount = Number(this.sendTokenForm.value.tokenAmount);

    if (!destination) {
      this.tokenErrorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      this.tokenErrorMessage = 'El monto del eToken debe ser un número entero mayor que cero.';
      return;
    }

    try {
      this.sendingToken = true;
      this.errorMessage = '';
      this.tokenErrorMessage = '';
      this.successMessage = '';

      const result = await this.carteraService.sendRMZToken(destination, amount);
      this.successMessage = `eToken enviado ✅ TXID: ${result.txid}`;
      this.sendTokenForm.reset({ tokenDestination: '', tokenAmount: null });
      await this.refreshBalance();
    } catch (error) {
      this.tokenErrorMessage = this.resolveErrorMessage(error);
    } finally {
      this.sendingToken = false;
    }
  }

  get bleConnected(): boolean {
    return Boolean(this.bleService?.connectedDevice);
  }

  get bleDeviceName(): string {
    return this.bleService?.connectedDevice?.name ?? 'Sin dispositivo';
  }

  get formattedRmzBalance(): string {
    if (this.rmzTokenBalance === null) {
      return '-- RMZ';
    }

    return `${this.rmzTokenBalance.toString()} RMZ`;
  }

  private async refreshBalance(address?: string): Promise<void> {
    try {
      const addr = address ?? this.walletService.getAddress();
      if (!addr) {
        this.balanceLabel = '0 XEC';
        this.rmzTokenBalance = null;
        return;
      }

      const [balance, rmzBalance] = await Promise.all([
        this.walletService.getBalance(addr),
        this.tokenBalanceService
          .getRMZBalance(addr)
          .catch((error) => {
            console.warn('No se pudo obtener el saldo del token RMZ.', error);
            return null;
          }),
      ]);

      this.balanceLabel = `${balance.toFixed(2)} XEC`;
      this.rmzTokenBalance = rmzBalance;
    } catch (error) {
      console.error('No se pudo obtener el saldo.', error);
      this.balanceLabel = 'Saldo no disponible';
      this.rmzTokenBalance = null;
    }
  }

  private async generateQr(): Promise<void> {
    if (!this.address) {
      this.qrImageSrc = null;
      return;
    }

    try {
      this.qrImageSrc = await QRCode.toDataURL(this.address);
    } catch (error) {
      console.error('No se pudo generar el código QR.', error);
      this.qrImageSrc = null;
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error) {
      return error;
    }

    return 'Se produjo un error inesperado.';
  }
}
