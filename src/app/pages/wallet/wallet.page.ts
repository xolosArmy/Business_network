import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CarteraService, WalletInfo } from '../../services/cartera.service';
import { SaldoService } from '../../services/saldo.service';
import { EnviarService } from '../../services/enviar.service';
import { BLEService } from '../../services/ble.service';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.page.html',
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
    private readonly ble: BLEService,
    private readonly formBuilder: FormBuilder,
  ) {
    this.sendForm = this.formBuilder.group({
      toAddress: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(0.01)]],
    });
  }

  async connectBLE(): Promise<void> {
    try {
      await this.ble.scanAndConnect();
    } catch (error) {
      console.error('[Wallet] Error al iniciar conexión BLE.', error);
    }
  }

  async sendBLE(): Promise<void> {
    const timestamp = new Date().toISOString();
    const payload = `TX ${timestamp}`;
    try {
      await this.ble.sendMessage(payload);
    } catch (error) {
      console.error('[Wallet] Error al enviar mensaje BLE.', error);
    }
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

  async sendHybrid(): Promise<void> {
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

      await this.ble.sendTxWithFallback(numericAmount, String(toAddress).trim());
      this.successMessage = 'Transacción enviada (BLE / Internet).';
      this.sendForm.reset();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.sending = false;
    }
  }
}
