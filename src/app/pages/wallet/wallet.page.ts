import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import QRCode from 'qrcode';

import { BleService } from '../../services/ble.service';
import { EnviarService } from '../../services/enviar.service';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage implements OnInit {
  address = '';
  balanceLabel = '0 XEC';
  showQr = false;
  qrImageSrc: string | null = null;
  sending = false;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  sendForm: FormGroup;
  bleAvailable = false;

  constructor(
    private readonly walletService: WalletService,
    private readonly enviarService: EnviarService,
    private readonly bleService: BleService,
    formBuilder: FormBuilder,
  ) {
    this.sendForm = formBuilder.group({
      toAddr: ['', [Validators.required]],
      amount: [null, [Validators.required, Validators.min(0.000001)]],
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
        return;
      }

      await this.walletService.loadFromMnemonic(mnemonic);
      this.address = await this.walletService.getAddress();
      await this.refreshBalance();
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

      const result = await this.enviarService.enviarTx(destination, amountInSats);
      if (result.success) {
        this.successMessage = `Transacción enviada ✅ TXID: ${result.txid}`;
        await this.refreshBalance();
        this.sendForm.reset();
      } else {
        this.errorMessage = result.error ?? 'No se pudo enviar la transacción.';
      }
    } catch (error) {
      console.error('Error al enviar transacción.', error);
      this.errorMessage = 'Error al enviar transacción.';
    } finally {
      this.sending = false;
    }
  }

  get bleConnected(): boolean {
    return Boolean(this.bleService?.connectedDevice);
  }

  get bleDeviceName(): string {
    return this.bleService?.connectedDevice?.name ?? 'Sin dispositivo';
  }

  private async refreshBalance(): Promise<void> {
    try {
      const balance = await this.walletService.getBalance();
      this.balanceLabel = `${balance.toFixed(2)} XEC`;
    } catch (error) {
      console.error('No se pudo obtener el saldo.', error);
      this.balanceLabel = 'Saldo no disponible';
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
}
