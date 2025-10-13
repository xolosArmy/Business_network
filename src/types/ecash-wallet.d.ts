declare module 'ecash-wallet' {
  import type { payment } from 'ecash-lib';
  import type { ChronikClient, ScriptUtxo } from 'chronik-client';

  class Wallet {
    readonly address: string;
    readonly pk: Uint8Array;
    readonly sk: Uint8Array;
    readonly chronik: ChronikClient;
    utxos: ScriptUtxo[];

    constructor(sk: Uint8Array, chronik: ChronikClient);

    sync(): Promise<void>;
    action(action: payment.Action, satsStrategy?: unknown): {
      build(): { tx: { ser(): Uint8Array } };
    };
    getAllUtxos(): Promise<ScriptUtxo[]>;
    createTx(params: {
      to: string;
      amount: number | bigint;
      feePerKb?: number | bigint;
      dustSats?: number | bigint;
    }): Promise<string>;
    broadcastTx(payload: unknown): Promise<unknown>;
    getAddress(): string;

    static fromMnemonic(mnemonic: string, chronik: ChronikClient): Wallet;
    static fromSk(sk: Uint8Array, chronik: ChronikClient): Wallet;
    static sumUtxosSats(utxos: ScriptUtxo[]): bigint;
  }

  export { Wallet };
}

declare module 'ecash-wallet/dist/index.js' {
  export { Wallet } from 'ecash-wallet';
}
