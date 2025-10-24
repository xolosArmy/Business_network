declare module 'minimal-xec-wallet/lib/key-derivation' {
  export interface DerivedKeyInfo {
    privateKey: string;
    publicKey: string;
    address: string;
    wif?: string;
    isCompressed?: boolean;
  }

  export default class KeyDerivation {
    constructor(localConfig?: Record<string, unknown>);
    deriveFromMnemonic(mnemonic: string, hdPath?: string): DerivedKeyInfo;
    deriveFromWif(wif: string): DerivedKeyInfo;
    generateMnemonic(strength?: number): string;
    validateMnemonic(mnemonic: string): boolean;
  }
}

declare module 'minimal-xec-wallet/lib/adapters/router' {
  export interface AdapterRouterOptions {
    chronik?: unknown;
    chronikUrls?: string[];
    [key: string]: unknown;
  }

  export interface AdapterRouterUtxoResponse {
    success?: boolean;
    utxos?: unknown[];
  }

  export default class AdapterRouter {
    constructor(localConfig?: AdapterRouterOptions);
    getUtxos(address: string | string[]): Promise<AdapterRouterUtxoResponse | AdapterRouterUtxoResponse[]>;
    getBalance(address: string | string[]): Promise<unknown>;
    sendTx(hex: string): Promise<string | { txid?: string }>;
  }
}

declare module 'minimal-xec-wallet/lib/hybrid-token-manager' {
  export interface HybridTokenBalance {
    tokenId: string;
    protocol: string;
    ticker: string;
    name: string;
    decimals: number;
    balance: {
      display: number;
      atoms: bigint;
    };
    utxoCount: number;
    [key: string]: unknown;
  }

  export default class HybridTokenManager {
    constructor(localConfig?: Record<string, unknown>);
    getTokenBalance(tokenId: string, utxos: unknown[]): Promise<HybridTokenBalance>;
    listTokensFromAddress(address: string): Promise<HybridTokenBalance[]>;
    listTokensFromUtxos(utxos: unknown[]): Promise<HybridTokenBalance[]>;
    sendTokens(
      tokenId: string,
      outputs: Array<{ address: string; amount?: number; value?: number }>,
      walletInfo: {
        mnemonic: string;
        xecAddress: string;
        hdPath?: string;
        fee?: number;
        privateKey: string;
        publicKey?: string;
      },
      utxos: unknown[],
      satsPerByte?: number,
    ): Promise<string>;
  }
}
