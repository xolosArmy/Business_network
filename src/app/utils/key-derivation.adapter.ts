// Shim de derivación mínimo para desbloquear UI y warmup.
// Provee los mismos nombres que usan tus servicios (*Async) y
// métodos derive/deriveFromMnemonic para compatibilidad.

type KDResult = {
  mnemonic: string;
  seed: Uint8Array;
  seedHex: string;              // <- NUEVO: lo espera cartera.service.ts
  address?: string;
  pubkey?: string;
  wif?: string;
};

export type KDLike = KDResult & {
  getAddress: () => string | undefined;
  derive: (hdPath: string) => Promise<KDResult>;
  deriveFromMnemonic: (mnemonic: string, hdPath: string) => Promise<KDResult>;
};

// util chiquito para hex
function toHex(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0");
  return s;
}

let _shared: {
  generateMnemonic: () => Promise<string>;
  validateMnemonic: (m: string) => Promise<boolean>;
  deriveKeysFromMnemonic: (m: string) => Promise<KDResult>;
  createForMnemonic: (m: string) => Promise<KDLike>;
} | null = null;

async function loadBip39() {
  const bip39 = await import('bip39');
  return bip39 as unknown as typeof import('bip39');
}

export async function generateMnemonic(): Promise<string> {
  const bip39 = await loadBip39();
  return bip39.generateMnemonic(128);
}

export async function validateMnemonic(m: string): Promise<boolean> {
  const bip39 = await loadBip39();
  return bip39.validateMnemonic(m);
}

export async function deriveKeysFromMnemonic(mnemonic: string): Promise<KDResult> {
  const bip39 = await loadBip39();
  const seedBuf = await bip39.mnemonicToSeed(mnemonic);
  const seed = new Uint8Array(seedBuf);
  const seedHex = toHex(seed);          // <- NUEVO
  // TODO: añadir derivación real XEC y address/pubkey/wif
  return { mnemonic, seed, seedHex };
}

export async function createForMnemonic(mnemonic: string): Promise<KDLike> {
  const base = await deriveKeysFromMnemonic(mnemonic);
  return {
    ...base,
    getAddress: () => base.address,
    derive: async (_hdPath: string) => ({ ...base }),
    deriveFromMnemonic: async (m: string, _hdPath: string) => deriveKeysFromMnemonic(m),
  };
}

export async function getSharedInstance() {
  if (_shared) return _shared;
  _shared = {
    generateMnemonic,
    validateMnemonic,
    deriveKeysFromMnemonic,
    createForMnemonic,
  };
  return _shared;
}

// Aliases de compatibilidad (no toques tus servicios)
export {
  generateMnemonic as generateMnemonicAsync,
  validateMnemonic as validateMnemonicAsync,
  deriveKeysFromMnemonic as deriveKeysFromMnemonicAsync,
};
