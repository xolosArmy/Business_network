// Shim mínimo de derivación basado en bip39 para desbloquear el warmup del TokenManager.
// Más adelante añadimos derivación real de dirección XEC y WIF.

type KDResult = {
  mnemonic: string;
  seed: Uint8Array;
  address?: string;
  pubkey?: string;
  wif?: string;
};

type KDModule = {
  generateMnemonic: () => Promise<string>;
  validateMnemonic: (m: string) => Promise<boolean>;
  deriveKeysFromMnemonic: (m: string) => Promise<KDResult>;
  createForMnemonic: (m: string) => Promise<KDResult & { getAddress: () => string | undefined }>;
};

let _shared: KDModule | null = null;

async function loadBip39() {
  // Carga dinámica para no inflar vendor en producción
  const bip39 = await import('bip39'); // CJS: mostrará warning, es normal por ahora.
  return bip39 as typeof import('bip39');
}

export async function generateMnemonic(): Promise<string> {
  const bip39 = await loadBip39();
  // 128 bits => 12 palabras
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
  // TODO: añadir derivación BIP44 m/44'/899'/0'/0/0 para XEC y calcular address/pubkey/wif
  return { mnemonic, seed };
}

export async function createForMnemonic(mnemonic: string) {
  const base = await deriveKeysFromMnemonic(mnemonic);
  return {
    ...base,
    getAddress: () => base.address,
  };
}

function buildKD(): KDModule {
  return {
    generateMnemonic,
    validateMnemonic,
    deriveKeysFromMnemonic,
    createForMnemonic,
  };
}

export async function getSharedInstance(): Promise<KDModule> {
  if (_shared) return _shared;
  _shared = buildKD();
  return _shared;
}
