import { Wallet } from 'ecash-wallet';
import { payment, toHex } from 'ecash-lib';

interface CreateTxParams {
  to: string;
  amount: number | bigint;
  feePerKb?: number | bigint;
  dustSats?: number | bigint;
}

type BroadcastPayload =
  | string
  | { [key: string]: unknown }
  | undefined
  | null;

const toBigInt = (value: number | bigint | undefined): bigint | undefined => {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  if (!Number.isFinite(value)) {
    throw new Error('Invalid numeric value provided.');
  }

  return BigInt(Math.round(value));
};

const ensurePositive = (value: bigint, label: string): void => {
  if (value <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
};

Wallet.prototype.getAllUtxos = async function getAllUtxos() {
  await this.sync();
  return this.utxos;
};

Wallet.prototype.createTx = async function createTx(params: CreateTxParams) {
  const { to, amount, feePerKb, dustSats } = params;

  if (typeof to !== 'string' || !to.trim()) {
    throw new Error('A destination address is required.');
  }

  const sats = toBigInt(amount);
  if (typeof sats === 'undefined') {
    throw new Error('A valid amount is required.');
  }

  ensurePositive(sats, 'Transaction amount');

  await this.sync();

  const action: payment.Action = {
    outputs: [
      {
        address: to.trim(),
        sats,
      },
    ],
  };

  const normalizedFee = toBigInt(feePerKb);
  if (typeof normalizedFee !== 'undefined') {
    ensurePositive(normalizedFee, 'Fee per KB');
    action.feePerKb = normalizedFee;
  }

  const normalizedDust = toBigInt(dustSats);
  if (typeof normalizedDust !== 'undefined') {
    ensurePositive(normalizedDust, 'Dust limit');
    action.dustSats = normalizedDust;
  }

  const builtTx = this.action(action).build();
  return toHex(builtTx.tx.ser());
};

const extractHex = (payload: BroadcastPayload): string => {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      throw new Error('Empty transaction payload provided.');
    }
    return trimmed;
  }

  if (payload && typeof payload === 'object') {
    const candidates = ['hex', 'rawHex', 'raw', 'serialized'];
    for (const key of candidates) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const possibleTx = payload['tx'];
    if (possibleTx && typeof possibleTx === 'object') {
      const txRecord = possibleTx as Record<string, unknown>;
      const serializer = txRecord['ser'];
      if (typeof serializer === 'function') {
        const result = serializer.call(txRecord);
        if (result instanceof Uint8Array) {
          return toHex(result);
        }
      }
    }
  }

  throw new Error('Unsupported transaction payload.');
};

Wallet.prototype.broadcastTx = async function broadcastTx(payload: BroadcastPayload) {
  const hex = extractHex(payload);
  return this.chronik.broadcastTx(hex);
};

Wallet.prototype.getAddress = function getAddress() {
  return this.address;
};
