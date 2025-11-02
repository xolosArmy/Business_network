declare module 'minimal-xec-wallet' {
  export interface AdapterRouterOptions {
    chronik?: unknown;
    chronikUrls?: string[];
    [key: string]: unknown;
  }

  export class AdapterRouter {
    constructor(localConfig?: AdapterRouterOptions);
    getUtxos(address: string | string[]): Promise<unknown>;
    sendTx(hex: string): Promise<string | { txid?: string }>;
  }

  export class KeyDerivation {
    constructor(localConfig?: Record<string, unknown>);
    deriveFromMnemonic(
      mnemonic: string,
      hdPath?: string,
    ): {
      address: string;
      publicKey: string;
      privateKey: string;
      [key: string]: unknown;
    };
    deriveFromWif(
      wif: string,
    ): {
      address: string;
      publicKey: string;
      privateKey: string;
      [key: string]: unknown;
    };
    generateMnemonic(strength?: number): string;
    validateMnemonic(mnemonic: string): boolean;
  }

  export interface HybridTokenSendOutputs {
    address: string;
    amount: bigint | number;
    value?: number;
  }

  export interface HybridTokenSendOptions {
    mnemonic?: string;
    xecAddress?: string;
    hdPath?: string;
    fee?: number;
    privateKey: string;
    publicKey?: string;
    [key: string]: unknown;
  }

  export class HybridTokenManager {
    constructor(localConfig?: Record<string, unknown>);
    sendTokens(
      tokenId: string,
      outputs: HybridTokenSendOutputs[],
      walletInfo: HybridTokenSendOptions,
      utxos: unknown[],
      satsPerByte?: number,
    ): Promise<string>;
    getTokenBalance(tokenId: string, utxos: unknown[]): Promise<any>;
    listTokensFromUtxos(utxos: unknown[]): Promise<any>;
  }
}

declare module 'src/types/minimal-xec-wallet' {
  export type { AdapterRouter } from 'minimal-xec-wallet';
}
