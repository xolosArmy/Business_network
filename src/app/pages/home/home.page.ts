import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavController, ToastController } from '@ionic/angular';
import { BehaviorSubject, Subscription } from 'rxjs';

import { CarteraService } from '../../services/cartera.service';
import { ChronikService } from '../../services/chronik.service';
import { SaldoService } from '../../services/saldo.service';
import { TokenBalanceService } from '../../services/token-balance.service';
import { TxStorageService } from '../../services/tx-storage.service';

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  public wallet: any = null;
  public connected = false;
  public loading = false;
  public balanceXec = this.saldo?.balanceXec$; // Observable<number>
  public balanceRmz = this.tokens?.balanceRmz$; // Observable<number>
  public txs = new BehaviorSubject<any[]>([]);

  private readonly subscriptions: Subscription[] = [];
  private readonly cleanupFns: Array<() => void> = [];

  constructor(
    private readonly cartera: CarteraService,
    private readonly saldo: SaldoService,
    private readonly tokens: TokenBalanceService,
    private readonly chronik: ChronikService,
    private readonly txStore: TxStorageService,
    private readonly toast: ToastController,
    private readonly nav: NavController,
  ) {
    this.balanceXec = this.saldo.balanceXec$;
    this.balanceRmz = this.tokens.balanceRmz$;
    this.connected = typeof navigator === 'undefined' ? false : navigator.onLine;
  }

  async ngOnInit(): Promise<void> {
    await this.loadWallet();
    const anyCartera = this.cartera as any;
    if (!this.wallet) {
      if (typeof anyCartera.getWalletInfo === 'function') {
        this.wallet = await anyCartera.getWalletInfo();
      } else if (typeof anyCartera.getWallet === 'function') {
        this.wallet = await anyCartera.getWallet();
      }
    }
    this.refreshTransactions();
    this.observeStoredTransactions();
    this.observeChronikStreams();
    this.observeNetworkStatus();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.cleanupFns.forEach((fn) => fn());
  }

  async onCrear(): Promise<void> {
    if (this.loading) {
      return;
    }

    this.loading = true;
    try {
      await this.cartera.createWallet();
      await this.loadWallet();
      await this.showToast('Cartera creada');
    } catch (error) {
      console.warn('No se pudo crear la cartera', error);
      await this.showToast('No se pudo crear la cartera');
    } finally {
      this.loading = false;
    }
  }

  onEnviar(): void {
    this.nav.navigateForward('/tabs/wallet');
  }

  async onRecibir(): Promise<void> {
    const address = this.wallet?.address;
    if (!address) {
      await this.showToast('Genera una cartera primero');
      return;
    }

    await this.showToast('Muestra QR aquí (TODO)');
  }

  mostrarQR(): void {
    void this.onRecibir();
  }

  async copiar(addr?: string): Promise<void> {
    if (!addr) {
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(addr);
      }
      await this.showToast('Dirección copiada');
    } catch (error) {
      console.warn('No se pudo copiar la dirección', error);
      await this.showToast('Error al copiar');
    }
  }

  abrirTx(tx: any): void {
    const txid = tx?.txid || tx?.id;
    if (!txid || typeof window === 'undefined') {
      return;
    }

    const url = `https://explorer.e.cash/tx/${txid}`;
    window.open(url, '_blank', 'noopener');
  }

  private async loadWallet(): Promise<void> {
    this.loading = true;
    try {
      const current = await this.cartera.getWalletInfo();
      const stored = this.readPersistedWallet();
      this.wallet = current?.address ? current : stored;

      if (this.wallet?.address) {
        this.persistWallet(this.wallet);
        await this.subscribeToChronik(this.wallet.address);
      } else if (stored?.address) {
        await this.subscribeToChronik(stored.address);
      }
    } catch (error) {
      console.warn('No se pudo cargar la cartera', error);
      const stored = this.readPersistedWallet();
      this.wallet = stored;
    } finally {
      this.loading = false;
    }
  }

  private async subscribeToChronik(address: string | undefined): Promise<void> {
    if (!address) {
      return;
    }

    try {
      await this.chronik.subscribeToAddress(address);
      this.connected = true;
    } catch (error) {
      console.warn('No se pudo suscribir a Chronik', error);
      this.connected = false;
    }
  }

  private refreshTransactions(): void {
    const stored = this.txStore.getAll();
    this.txs.next(this.normalizeTransactions(stored));
  }

  private observeStoredTransactions(): void {
    const sub = this.txStore.tx$.subscribe((entries) => {
      this.txs.next(this.normalizeTransactions(entries));
    });
    this.subscriptions.push(sub);
  }

  private observeChronikStreams(): void {
    const anyChronik = this.chronik as any;
    if (anyChronik.connected$?.subscribe) {
      const statusSub = anyChronik.connected$.subscribe((v: boolean) => {
        this.connected = !!v;
      });
      this.subscriptions.push(statusSub);
    } else {
      this.connected = true;
    }

    if (anyChronik.txs$?.subscribe) {
      const txSub = anyChronik.txs$.subscribe((list: any[]) => {
        this.txs.next(list || []);
      });
      this.subscriptions.push(txSub);
    }
  }

  private observeNetworkStatus(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const setOnline = () => (this.connected = true);
    const setOffline = () => (this.connected = false);

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);

    this.cleanupFns.push(() => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    });
  }

  private persistWallet(wallet: any): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem('rmz_wallet', JSON.stringify(wallet));
  }

  private readPersistedWallet(): any {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem('rmz_wallet');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizeTransactions(entries: any[] | null | undefined): any[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.map((tx) => ({
      type: tx?.type === 'sent' ? 'send' : 'receive',
      amount: Number(tx?.amount ?? 0),
      time: tx?.timestamp ?? tx?.time ?? new Date().toISOString(),
      confirmed: tx?.status === 'confirmed',
      txid: tx?.txid ?? tx?.id,
    }));
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await toast.present();
  }
}
