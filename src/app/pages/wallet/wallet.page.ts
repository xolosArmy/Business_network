import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { BleService } from '../../services/ble.service';
import { CarteraService } from '../../services/cartera.service';
import { EnviarService } from '../../services/enviar.service';
import { SaldoService } from '../../services/saldo.service';
import { TxBLEService } from '../../services/tx-ble.service';

type WalletInfo = Awaited<ReturnType<CarteraService['getWalletInfo']>>;

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage implements OnInit {
  wallet: any = null;
  balanceLabel = '--';
  showQr = false;
  qrImageSrc: string | null = null;
  sending = false;
  errorMessage = '';
  successMessage = '';
  sendForm: FormGroup;

  toAddr = '';
  amount = '';

  constructor(
    private readonly carteraService: CarteraService,
    private readonly saldoService: SaldoService,
    private readonly enviarService: EnviarService,
    private readonly ble: BleService,
    private readonly txBle: TxBLEService,
    formBuilder: FormBuilder,
  ) {
    this.sendForm = formBuilder.group({
      toAddress: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(0.000001)]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadWallet();
  }

  async toggleQr(): Promise<void> {
    this.showQr = !this.showQr;

    if (!this.showQr) {
      this.qrImageSrc = null;
      return;
    }

    const address = (this.wallet as WalletInfo | null)?.address;
    if (typeof address !== 'string' || !address.trim()) {
      this.qrImageSrc = null;
      return;
    }

    this.qrImageSrc = this.buildQrUrl(address);
  }

  async advertiseWallet(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    const address = (this.wallet as WalletInfo | null)?.address;
    if (typeof address !== 'string' || !address.trim()) {
      this.errorMessage = 'No hay una dirección de cartera disponible.';
      return;
    }

    try {
      await this.ble.advertise(address);
      this.successMessage = 'Wallet lista para anunciar por BLE.';
    } catch (error) {
      this.errorMessage = this.resolveError(error);
    }
  }

  async scanForPeers(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.ble.scanAndConnect();
      this.successMessage = 'Escaneo BLE iniciado.';
    } catch (error) {
      this.errorMessage = this.resolveError(error);
    }
  }

  async connectBLE(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.ble.scanAndConnect();
      this.successMessage = 'Intentando conectar con dispositivos BLE cercanos.';
    } catch (error) {
      this.errorMessage = this.resolveError(error);
    }
  }

  async sendTxBLE(destination?: string, amountValue?: number): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    const to = (destination ?? this.toAddr).trim();
    const parsedAmount = amountValue ?? Number(this.amount);

    if (!to) {
      this.errorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      this.errorMessage = 'El monto debe ser mayor que cero.';
      return;
    }

    try {
      await this.txBle.createAndSendTx(to, parsedAmount);
      this.successMessage = 'Transacción enviada por BLE.';
    } catch (error) {
      this.errorMessage = this.resolveError(error);
    }
  }

  async sendHybrid(): Promise<void> {
    if (this.sendForm.invalid) {
      this.sendForm.markAllAsTouched();
      return;
    }

    const destination = String(this.sendForm.value.toAddress ?? '').trim();
    const amount = Number(this.sendForm.value.amount);

    if (!destination) {
      this.errorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      this.errorMessage = 'El monto debe ser mayor que cero.';
      return;
    }

    await this.sendTxBLE(destination, amount);
    const sent = await this.sendViaNetwork(destination, amount);
    if (sent) {
      this.sendForm.reset();
    }
  }

  async onSubmit(): Promise<void> {
    if (this.sendForm.invalid) {
      this.sendForm.markAllAsTouched();
      return;
    }

    const destination = String(this.sendForm.value.toAddress ?? '').trim();
    const amount = Number(this.sendForm.value.amount);

    if (!destination) {
      this.errorMessage = 'La dirección de destino es obligatoria.';
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      this.errorMessage = 'El monto debe ser mayor que cero.';
      return;
    }

    const sent = await this.sendViaNetwork(destination, amount);
    if (sent) {
      this.sendForm.reset();
    }
  }

  private async loadWallet(): Promise<void> {
    try {
      const wallet = await this.carteraService.getWalletInfo();
      this.wallet = wallet;

      if (wallet?.address && wallet?.mnemonic) {
        await this.updateBalanceLabel(wallet);
      } else {
        this.balanceLabel = 'Sin cartera configurada';
      }
    } catch (error) {
      this.errorMessage = this.resolveError(error);
    }
  }

  private async updateBalanceLabel(wallet: NonNullable<WalletInfo>): Promise<void> {
    try {
      const balance = await this.saldoService.getBalance(wallet);
      this.balanceLabel = `${this.saldoService.formatBalance(balance)} XEC`;
    } catch (error) {
      console.error('No se pudo actualizar el saldo de la cartera.', error);
      this.balanceLabel = 'Saldo no disponible';
    }
  }

  private buildQrUrl(address: string): string {
    const encoded = encodeURIComponent(address.trim());
    return `https://quickchart.io/qr?text=${encoded}&size=256&margin=1`;
  }

  private async sendViaNetwork(destination: string, amount: number): Promise<boolean> {
    const wallet = this.wallet as WalletInfo | null;
    if (!wallet?.mnemonic) {
      this.errorMessage = 'Debes configurar una cartera antes de enviar fondos.';
      return false;
    }

    this.sending = true;
    this.errorMessage = '';
    this.successMessage = '';
    let succeeded = false;

    try {
      const txid = await this.enviarService.sendTransaction(wallet, destination, amount);
      const isPending = txid.startsWith('pending-offline-');
      this.successMessage = isPending
        ? 'Transacción guardada para enviar cuando haya conexión.'
        : `Transacción enviada correctamente: ${txid}`;
      succeeded = true;
      await this.updateBalanceLabel(wallet);
    } catch (error) {
      this.errorMessage = this.resolveError(error);
    } finally {
      this.sending = false;
    }

    return succeeded;
  }

  private resolveError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Ocurrió un error inesperado.';
  }
}
