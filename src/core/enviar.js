import AsyncStorage from '@react-native-async-storage/async-storage';
import { mnemonicToSeed } from 'bip39';
import { ChronikClient } from 'chronik-client';
import {
  HdNode,
  Script,
  TxBuilder,
  P2PKHSignatory,
  ALL_BIP143,
  toHex,
} from 'ecash-lib';

const STORAGE_KEY = 'rmz_wallet';
const DERIVATION_PATH = "m/44'/899'/0'/0/0";
const CHRONIK_URL = 'https://chronik.e.cash';
const FEE_PER_KB = 1000n; // 1 sat/byte
const DUST_SATS = 546n;

const toBigInt = (value) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Valor numérico inválido');
    }
    return BigInt(Math.trunc(value));
  }
  return BigInt(String(value));
};

const xecToSats = (amount) => {
  if (amount === undefined || amount === null) {
    throw new Error('Monto requerido');
  }
  const raw = typeof amount === 'number' ? amount.toString() : String(amount).trim();
  if (!raw || raw.startsWith('-')) {
    throw new Error('Monto inválido');
  }
  const [ints, decimals = ''] = raw.split('.');
  if (!/^\d+$/.test(ints)) {
    throw new Error('Monto inválido');
  }
  if (decimals.length > 2) {
    throw new Error('El monto XEC admite máximo 2 decimales');
  }
  const dec = (decimals + '00').slice(0, 2);
  return BigInt(ints) * 100n + BigInt(dec || '0');
};

const loadStoredWallet = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error('No hay cartera almacenada');
  }
  try {
    const wallet = JSON.parse(raw);
    if (!wallet?.mnemonic || !wallet?.address) {
      throw new Error('Cartera incompleta');
    }
    return wallet;
  } catch (err) {
    throw new Error('Cartera almacenada inválida');
  }
};

const buildSignedTx = ({
  utxos,
  amountSats,
  destScript,
  changeScript,
  signatory,
  spendScript,
}) => {
  const inputs = utxos.map((coin) => ({
    input: {
      prevOut: {
        txid: coin.outpoint.txid,
        outIdx: coin.outpoint.outIdx,
      },
      signData: {
        sats: toBigInt(coin.sats),
        outputScript: spendScript,
      },
    },
    signatory,
  }));

  const builder = new TxBuilder({
    inputs,
    outputs: [
      { sats: amountSats, script: destScript.copy() },
      changeScript.copy(),
    ],
  });

  return builder.sign({ feePerKb: FEE_PER_KB, dustSats: DUST_SATS });
};

export async function sendRawTx(destino, montoXec) {
  if (!destino) {
    throw new Error('Dirección destino requerida');
  }

  const { mnemonic, address } = await loadStoredWallet();
  const amountSats = xecToSats(montoXec);
  if (amountSats <= 0n) {
    throw new Error('El monto debe ser mayor que 0');
  }

  const seed = await mnemonicToSeed(mnemonic);
  const master = HdNode.fromSeed(new Uint8Array(seed));
  const node = master.derivePath(DERIVATION_PATH);
  const seckey = node.seckey();
  const pubkey = node.pubkey();

  if (!seckey) {
    throw new Error('No se pudo derivar la clave privada');
  }

  const spendScript = Script.p2pkh(node.pkh());
  const destScript = Script.fromAddress(destino);
  const changeScript = Script.fromAddress(address);
  const signatory = P2PKHSignatory(seckey, pubkey, ALL_BIP143);

  const chronik = new ChronikClient(CHRONIK_URL);
  const utxoResponse = await chronik.address(address).utxos();
  const allUtxos = Array.isArray(utxoResponse?.utxos) ? utxoResponse.utxos : [];

  if (!allUtxos.length) {
    throw new Error('No hay fondos disponibles');
  }

  let chainInfo;
  const spendable = [];
  for (const coin of allUtxos) {
    if (coin.token) continue;
    if (coin.isCoinbase) {
      if (coin.blockHeight < 0) continue;
      if (!chainInfo) {
        chainInfo = await chronik.blockchainInfo();
      }
      if (!chainInfo || chainInfo.tipHeight - coin.blockHeight < 100) {
        continue;
      }
    }
    spendable.push(coin);
  }

  if (!spendable.length) {
    throw new Error('No hay UTXOs disponibles para gastar');
  }

  spendable.sort((a, b) => {
    const aSats = toBigInt(a.sats);
    const bSats = toBigInt(b.sats);
    if (aSats === bSats) {
      return (a.blockHeight ?? 0) - (b.blockHeight ?? 0);
    }
    return aSats < bSats ? -1 : 1;
  });

  const selected = [];
  let total = 0n;
  let tx = null;
  let lastError;

  for (const coin of spendable) {
    selected.push(coin);
    total += toBigInt(coin.sats);
    if (total < amountSats) {
      continue;
    }

    try {
      tx = buildSignedTx({
        utxos: selected,
        amountSats,
        destScript,
        changeScript,
        signatory,
        spendScript,
      });
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!tx) {
    if (lastError) {
      throw lastError;
    }
    throw new Error('Fondos insuficientes para cubrir monto y comisión');
  }

  const rawTxHex = toHex(tx.ser());
  const { txid } = await chronik.broadcastTx(rawTxHex);

  return { txid, hex: rawTxHex };
}

export default sendRawTx;
