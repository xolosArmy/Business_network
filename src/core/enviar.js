import AsyncStorage from '@react-native-async-storage/async-storage';
import * as bip39 from 'bip39';
import { ChronikClient } from 'chronik-client';
import {
  Address,
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
const FIXED_FEE_SATS = 1000n;
const DUST_SATS = 546n;

const toBigInt = (value) => {
  if (typeof value === 'bigint') return value;
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
  if (!/^\d*$/.test(decimals) || decimals.length > 2) {
    throw new Error('El monto XEC admite máximo 2 decimales');
  }
  const dec = (decimals + '00').slice(0, 2);
  return BigInt(ints) * 100n + BigInt(dec || '0');
};

const loadWallet = async () => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) {
    throw new Error('No hay cartera guardada');
  }
  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch (error) {
    throw new Error('Cartera almacenada inválida');
  }
  if (!parsed?.mnemonic || !parsed?.address) {
    throw new Error('Cartera incompleta');
  }
  return parsed;
};

const buildInputs = (utxos, signatory, spendScript) =>
  utxos.map((utxo) => ({
    input: {
      prevOut: {
        txid: utxo.outpoint.txid,
        outIdx: utxo.outpoint.outIdx,
      },
      signData: {
        sats: toBigInt(utxo.sats),
        outputScript: spendScript.copy(),
      },
    },
    signatory,
  }));

export async function sendRawTx(destino, amountXec) {
  try {
    if (!destino) {
      throw new Error('Dirección destino requerida');
    }

    const { mnemonic } = await loadWallet();
    const satsOut = xecToSats(amountXec);
    if (satsOut <= 0n) {
      throw new Error('El monto debe ser mayor que 0');
    }

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const master = HdNode.fromSeed(new Uint8Array(seed));
    const accountNode = master.derivePath(DERIVATION_PATH);

    const privKey = accountNode.seckey();
    if (!privKey) {
      throw new Error('No se pudo derivar la clave privada');
    }
    const pubKey = accountNode.pubkey();
    const pubKeyHash = accountNode.pkh();

    const fromAddress = Address.p2pkh(pubKeyHash).address;
    const spendScript = Script.p2pkh(pubKeyHash);
    const destScript = Script.fromAddress(destino);
    const changeScript = Script.fromAddress(fromAddress);
    const signatory = P2PKHSignatory(privKey, pubKey, ALL_BIP143);

    const chronik = new ChronikClient(CHRONIK_URL);
    const utxoResponse = await chronik.address(fromAddress).utxos();
    const utxos = Array.isArray(utxoResponse?.utxos) ? utxoResponse.utxos : [];
    const spendable = utxos.filter((utxo) => !utxo.token);

    if (!spendable.length) {
      throw new Error('No hay UTXOs disponibles');
    }

    let chainInfo;
    const mature = [];
    for (const utxo of spendable) {
      if (utxo.isCoinbase) {
        if (utxo.blockHeight < 0) {
          continue;
        }
        if (!chainInfo) {
          chainInfo = await chronik.blockchainInfo();
        }
        if (!chainInfo || chainInfo.tipHeight - utxo.blockHeight < 100) {
          continue;
        }
      }
      mature.push(utxo);
    }

    if (!mature.length) {
      throw new Error('No hay UTXOs disponibles para gastar');
    }

    const requiredTotal = satsOut + FIXED_FEE_SATS;
    const selected = [];
    let total = 0n;
    for (const utxo of mature) {
      selected.push(utxo);
      total += toBigInt(utxo.sats);
      if (total >= requiredTotal) {
        break;
      }
    }

    if (total < requiredTotal) {
      throw new Error('Fondos insuficientes');
    }

    const change = total - requiredTotal;
    const outputs = [{ sats: satsOut, script: destScript.copy() }];
    if (change >= DUST_SATS) {
      outputs.push({ sats: change, script: changeScript.copy() });
    }

    const builder = new TxBuilder({
      inputs: buildInputs(selected, signatory, spendScript),
      outputs,
    });

    const tx = builder.sign();
    const rawHex = toHex(tx.ser());
    const { txid } = await chronik.broadcastTx(rawHex);

    return { success: true, txid };
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  }
}

export default sendRawTx;
