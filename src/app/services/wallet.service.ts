import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Wallet } from 'ecash-wallet';
import { ChronikClient, type SubscribeMsg } from 'chronik-client';
import { generateMnemonic, validateMnemonic } from 'bip39';
import { SLP_TOKEN_TYPE_FUNGIBLE, toHex } from 'ecash-lib';

import { ChronikService } from './chronik.service';
import { SyncService, type SyncStatus } from './sync.service';
import { CHRONIK } from '../../environments/chronik.config';

const MNEMONIC_STORAGE_KEY = 'mnemonicKey';
const ADDRESS_STORAGE_KEY = 'walletAddress';
const MIN_TOKEN_SATS = 546n;

type TxStatus = 'pendiente' | 'confirmada';

export interface WalletState {
  address: string | null;
  mnemonic: string | null;
  xecBalance: number;
  rmzBalance: bigint;
  rmzBalanceFormatted: string;
  chronikConnected: boolean;
  syncStatus: SyncStatus;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly stateSubject = new BehaviorSubject<WalletState>({
    address: null,
    mnemonic: null,
    xecBalance: 0,
    rmzBalance: 0n,
    rmzBalanceFormatted: '0',
    chronikConnected: false,
    syncStatus: 'idle',
  });
  readonly state$ = this.stateSubject.asObservable();

  private chronikClient?: ChronikClient;
  private wallet?: Wallet;

  public lastSentTxid?: string;
  public lastSentStatus?: TxStatus;

  private rmzDecimals = 0;
  private rmzMultiplier = 1n;
  private rmzInfoLoaded = false;
  private rmzInfoLoading?: Promise<void>;
  private syncServiceInstance?: SyncService;

  constructor(
    private readonly chronikService: ChronikService,
    private readonly injector: Injector,
  ) {
    this.chronikService.wsConnected$.subscribe((connected) => {
      this.patchState({
        chronikConnected: connected || this.stateSubject.value.chronikConnected,
      });
    });
  }

  get address(): string | null {
    return this.stateSubject.value.address;
  }

  get mnemonic(): string | null {
    return this.stateSubject.value.mnemonic;
  }

  get xecBalance(): number {
    return this.stateSubject.value.xecBalance;
  }

  get rmzBalance(): bigint {
    return this.stateSubject.value.rmzBalance;
  }

  get rmzBalanceFormatted(): string {
    return this.stateSubject.value.rmzBalanceFormatted;
  }

  get chronikConnected(): boolean {
    return this.stateSubject.value.chronikConnected;
  }

  get syncStatus(): SyncStatus {
    return this.stateSubject.value.syncStatus;
  }

  async generateNewWallet(): Promise<string> {
    const mnemonic = generateMnemonic();
    await this.initializeFromMnemonic(mnemonic);
    this.persistMnemonic(mnemonic);
    this.persistAddress();
    this.alertMnemonic(mnemonic);
    return mnemonic;
  }

  async initWallet(mnemonic?: string): Promise<void> {
    let phrase: string | undefined = mnemonic?.trim();
    if (phrase && !validateMnemonic(phrase)) {
      throw new Error('La frase mnemónica proporcionada no es válida.');
    }

    if (!phrase) {
      const stored = this.retrieveMnemonic() || undefined;
      phrase = stored;
    }

    if (!phrase) {
      await this.generateNewWallet();
      return;
    }

    await this.initializeFromMnemonic(phrase);
    this.persistMnemonic(phrase);
    this.persistAddress();
  }

  getAddress(): string {
    if (!this.address) {
      throw new Error('Wallet no inicializada.');
    }
    return this.address;
  }

  async getWalletInfo(): Promise<WalletState> {
    return { ...this.stateSubject.value };
  }

  async createWallet(): Promise<WalletState> {
    await this.generateNewWallet();
    return this.getWalletInfo();
  }

  async updateBalances(): Promise<{ xec: number; rmz: bigint }> {
    const address = this.address;
    if (!address) {
      throw new Error('Wallet no inicializada.');
    }

    try {
      const utxos = await this.chronikService.getAddressUtxos(address);
      const sats = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
      const xecBalance = sats / 1e8;
      const tokenInfo = await this.chronikService.getTokenInfo(CHRONIK.RMZ_TOKEN_ID);
      await this.ensureRmzTokenMetadata(tokenInfo);
      const rmzBalanceRaw = await this.computeRmzBalance(utxos, CHRONIK.RMZ_TOKEN_ID);
      const rmzBalance = BigInt(rmzBalanceRaw);

      this.patchState({
        xecBalance,
        rmzBalance,
        rmzBalanceFormatted: this.formatTokenAmount(rmzBalance),
        chronikConnected: true,
      });

      return { xec: xecBalance, rmz: rmzBalance };
    } catch (error) {
      this.patchState({ chronikConnected: false });
      console.warn('[WalletService] No se pudo actualizar balances', error);
      throw error;
    }
  }

  async sendXec(destino: string, montoXec: number): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet no inicializada.');
    }

    const sats = BigInt(Math.round(montoXec * 100));
    if (sats <= 0n) {
      throw new Error('El monto en XEC debe ser mayor que cero.');
    }

    try {
      await this.wallet.sync();
      const built = this.wallet
        .action({
          outputs: [
            {
              address: destino.trim(),
              sats,
            },
          ],
        })
        .build();

      const txHex = toHex(built.tx.ser());
      const resp = await this.ensureChronikClient().broadcastTx(txHex);

      this.lastSentTxid = resp.txid;
      this.lastSentStatus = 'pendiente';
      await this.updateBalances();
      return resp.txid;
    } catch (error) {
      console.error('[WalletService] Error al enviar XEC', error);
      throw error;
    }
  }

  async sendToken(destino: string, montoTokens: number | string | bigint): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet no inicializada.');
    }
    if (!destino?.trim()) {
      throw new Error('La dirección destino es requerida.');
    }
    await this.ensureRmzTokenMetadata();
    const atoms = this.tokenAmountToAtoms(montoTokens);
    if (atoms <= 0n) {
      throw new Error(
        `El monto de RMZ debe ser mayor que 0. Recuerda que el token permite ${this.rmzDecimals} decimales.`,
      );
    }

    try {
      await this.wallet.sync();
      const built = this.wallet
        .action({
          outputs: [
            { sats: 0n },
            {
              address: destino.trim(),
              tokenId: CHRONIK.RMZ_TOKEN_ID,
              atoms,
              isMintBaton: false,
              sats: MIN_TOKEN_SATS,
            },
          ],
          tokenActions: [
            {
              type: 'SEND',
              tokenId: CHRONIK.RMZ_TOKEN_ID,
              tokenType: SLP_TOKEN_TYPE_FUNGIBLE,
            },
          ],
          dustSats: MIN_TOKEN_SATS,
        })
        .build();

      const txHex = toHex(built.tx.ser());
      const resp = await this.ensureChronikClient().broadcastTx(txHex);

      this.lastSentTxid = resp.txid;
      this.lastSentStatus = 'pendiente';
      await this.updateBalances();
      return resp.txid;
    } catch (error) {
      console.error('[WalletService] Error al enviar RMZ', error);
      throw error;
    }
  }

  async signTx(toAddress: string, amountXec: number): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet no inicializada.');
    }
    const sats = BigInt(Math.round(amountXec * 100));
    if (sats <= 0n) {
      throw new Error('El monto a firmar debe ser mayor que cero.');
    }

    await this.wallet.sync();
    const built = this.wallet
      .action({
        outputs: [
          {
            address: toAddress.trim(),
            sats,
          },
        ],
      })
      .build();

    return toHex(built.tx.ser());
  }

  private patchState(partial: Partial<WalletState>): void {
    const next = { ...this.stateSubject.value, ...partial };
    this.stateSubject.next(next);
  }

  private getSyncService(): SyncService {
    if (!this.syncServiceInstance) {
      const service = this.injector.get(SyncService);
      this.syncServiceInstance = service;
      service.status$.subscribe((status) => {
        const chronikConnected = status === 'synced' || status === 'syncing' || this.stateSubject.value.chronikConnected;
        this.patchState({
          syncStatus: status,
          chronikConnected,
        });
      });
    }
    return this.syncServiceInstance;
  }

  private ensureChronikClient(): ChronikClient {
    if (!this.chronikClient) {
      this.chronikClient = new ChronikClient(CHRONIK.REST_BASES[0]);
    }
    return this.chronikClient;
  }

  private async initializeFromMnemonic(mnemonic: string): Promise<void> {
    const chronikClient = this.ensureChronikClient();
    this.wallet = await Wallet.fromMnemonic(mnemonic, chronikClient);
    this.patchState({ mnemonic });

    try {
      await this.wallet.sync();
    } catch (error) {
      console.warn('[WalletService] Sync inicial falló (se continuará con el flujo)', error);
    }

    const address = this.wallet.address;
    this.patchState({ address });
    this.persistAddress();
    await this.ensureRmzTokenMetadata();
    await this.getSyncService().watchAddress(address, (msg) => {
      void this.handleChronikMessage(msg);
    });
    this.chronikService.connectWS([address]);
    await this.sync();
  }

  private async handleChronikMessage(msg: SubscribeMsg): Promise<void> {
    if (!msg?.type) {
      return;
    }

    const { type } = msg;
    const txid = (msg as { txid?: string }).txid;
    if (txid && this.lastSentTxid === txid && type === 'Confirmed') {
      this.lastSentStatus = 'confirmada';
    }

    try {
      await this.sync();
    } catch {
      // El estado de conexión ya se maneja en updateBalances.
    }
  }

  private async sync(): Promise<void> {
    try {
      await this.updateBalances();
    } catch {
      // updateBalances already logs connectivity issues.
    }
  }

  private persistMnemonic(mnemonic: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(MNEMONIC_STORAGE_KEY, mnemonic);
  }

  private retrieveMnemonic(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(MNEMONIC_STORAGE_KEY);
  }

  private persistAddress(): void {
    if (typeof localStorage === 'undefined' || !this.address) {
      return;
    }
    localStorage.setItem(ADDRESS_STORAGE_KEY, this.address);
  }

  private alertMnemonic(mnemonic: string): void {
    if (typeof window === 'undefined' || typeof window.alert !== 'function') {
      return;
    }
    window.alert(`Se generó una nueva cartera.\n\nGuarda tu frase:\n${mnemonic}`);
  }

  private async ensureRmzTokenMetadata(tokenInfo?: any): Promise<void> {
    if (this.rmzInfoLoaded) {
      return;
    }
    if (this.rmzInfoLoading) {
      await this.rmzInfoLoading;
      return;
    }

    this.rmzInfoLoading = (async () => {
      try {
        const info = tokenInfo ?? (await this.chronikService.getTokenInfo(CHRONIK.RMZ_TOKEN_ID));
        const decimals = info?.slpTxData?.genesisInfo?.decimals ?? 0;
        this.rmzDecimals = typeof decimals === 'number' && decimals >= 0 ? decimals : 0;
        this.rmzMultiplier = BigInt(10) ** BigInt(this.rmzDecimals);
        this.rmzInfoLoaded = true;
      } catch (error) {
        console.warn('[WalletService] No se pudo obtener info del token RMZ', error);
        this.rmzDecimals = 0;
        this.rmzMultiplier = 1n;
      } finally {
        this.rmzInfoLoading = undefined;
      }
    })();

    await this.rmzInfoLoading;
  }

  private async computeRmzBalance(utxos: any[], tokenId: string): Promise<number> {
    let sum = 0n;
    const normalizedTokenId = tokenId?.toLowerCase?.() ?? tokenId;
    for (const utxo of utxos) {
      const currentTokenId = utxo?.token?.tokenId?.toLowerCase?.();
      if (currentTokenId === normalizedTokenId) {
        try {
          sum += BigInt(utxo.token.amount);
        } catch {
          // ignore malformed amounts
        }
      }
    }
    return Number(sum);
  }

  private tokenAmountToAtoms(amount: number | string | bigint): bigint {
    if (typeof amount === 'bigint') {
      return amount;
    }

    const rawString =
      typeof amount === 'number'
        ? Number.isFinite(amount)
          ? amount.toString()
          : ''
        : String(amount ?? '').trim();

    if (!rawString) {
      throw new Error('El monto de tokens debe ser un número válido.');
    }

    if (!/^\d+(\.\d+)?$/.test(rawString)) {
      throw new Error('Solo se permiten valores numéricos positivos para RMZ.');
    }

    const [wholePart, fractionPart = ''] = rawString.split('.');
    if (this.rmzDecimals === 0 && fractionPart.length > 0) {
      throw new Error('Este token no acepta decimales.');
    }
    if (fractionPart.length > this.rmzDecimals) {
      throw new Error(`Solo se permiten hasta ${this.rmzDecimals} decimales en RMZ.`);
    }

    const paddedFraction = this.rmzDecimals > 0 ? fractionPart.padEnd(this.rmzDecimals, '0') : '';
    const combined = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, '');
    return BigInt(combined || '0');
  }

  private formatTokenAmount(atoms: bigint): string {
    if (this.rmzDecimals <= 0) {
      return atoms.toString();
    }
    const multiplier = this.rmzMultiplier;
    const isNegative = atoms < 0;
    const absAtoms = isNegative ? -atoms : atoms;
    const whole = absAtoms / multiplier;
    const fraction = absAtoms % multiplier;
    if (fraction === 0n) {
      return `${isNegative ? '-' : ''}${whole.toString()}`;
    }
    const fractionStr = fraction
      .toString()
      .padStart(this.rmzDecimals, '0')
      .replace(/0+$/, '');
    return `${isNegative ? '-' : ''}${whole.toString()}.${fractionStr}`;
  }
}
